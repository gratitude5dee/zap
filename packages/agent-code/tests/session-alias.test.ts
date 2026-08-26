// Sessions bind to the deployment they started on; alias moves never mutate
// in-flight sessions; history.jsonl journals every move.
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalManifest, makeHost } from "./helpers/host.ts";

describe("session alias binding", () => {
  it("pins deploymentId at session creation and journals alias moves", async () => {
    const fixture = await makeHost({ payer: "byok" });
    const first = canonicalManifest().bundleSha;

    // development points at the first deployment; promote to production
    await fixture.host.moveAlias("production", first, "deploy --alias production");
    const session = await fixture.host.createSession({ agent: "transcode", alias: "production" });
    expect(session.deploymentId).toBe(first);

    // a new deployment arrives and production moves
    const second = canonicalManifest();
    second.bundleSha = "1".repeat(64);
    await fixture.host.registerDeployment({ manifest: second });
    await fixture.host.moveAlias("production", second.bundleSha, "deploy --alias production");

    // in-flight session keeps its pin; a new session gets the new deployment
    const unchanged = await fixture.host.getSession(session.id);
    expect(unchanged?.deploymentId).toBe(first);
    const fresh = await fixture.host.createSession({ agent: "transcode", alias: "production" });
    expect(fresh.deploymentId).toBe(second.bundleSha);

    // history records both production moves
    const history = (await fs.readFile(path.join(fixture.root, "aliases", "history.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { alias: string; deploymentId: string });
    const productionMoves = history.filter((move) => move.alias === "production");
    expect(productionMoves.map((move) => move.deploymentId)).toEqual([first, second.bundleSha]);
  });

  it("watch-style deploys move only development", async () => {
    const fixture = await makeHost({ payer: "byok" });
    const first = canonicalManifest().bundleSha;
    await fixture.host.moveAlias("production", first, "deploy --alias production");

    const second = canonicalManifest();
    second.bundleSha = "2".repeat(64);
    await fixture.host.registerDeployment({ manifest: second });
    await fixture.host.moveAlias("development", second.bundleSha, "deploy --watch");

    expect((await fixture.host.getAlias("development"))?.deploymentId).toBe(second.bundleSha);
    expect((await fixture.host.getAlias("production"))?.deploymentId).toBe(first);
  });

  it("an alias move never creates a deployment", async () => {
    const fixture = await makeHost({ payer: "byok" });
    const before = await fs.readdir(path.join(fixture.root, "deployments"));
    await fixture.host.moveAlias("production", canonicalManifest().bundleSha, "promote");
    const after = await fs.readdir(path.join(fixture.root, "deployments"));
    expect(after).toEqual(before);
  });

  it("rejects a session on an alias that resolves to no deployment", async () => {
    const fixture = await makeHost({ payer: "byok" });
    await expect(fixture.host.createSession({ agent: "transcode", alias: "production" })).rejects.toMatchObject({
      code: "ALIAS_NOT_FOUND",
    });
  });
});
