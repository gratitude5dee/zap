import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mcpRegistrationFragment, OPENVIKING_MCP_URL } from "../src/mcp.ts";
import { createInMemoryTransport, openVikingPaths, renderOvConf } from "../src/openviking.ts";
import { createOvctl } from "../src/ovctl.ts";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const heavyDir = path.join(repoRoot, "packages", "templates", "zap-heavy");

describe("ov.conf renderer", () => {
  const conf = renderOvConf({ home: "/home/user" });
  const parsed = JSON.parse(conf) as {
    server: { host: string; port: number; auth_mode: string };
    storage: { workspace: string; agfs: { backend: string }; vectordb: { backend: string } };
  };

  it("binds to 127.0.0.1:1933 only", () => {
    expect(parsed.server.host).toBe("127.0.0.1");
    expect(parsed.server.port).toBe(1933);
    expect(conf).not.toContain("0.0.0.0");
  });

  it("stores under ~/.zap/memory/openviking with local backends", () => {
    expect(parsed.storage.workspace).toBe("/home/user/.zap/memory/openviking/data");
    expect(parsed.storage.agfs.backend).toBe("local");
    expect(parsed.storage.vectordb.backend).toBe("local");
    expect(parsed.server.auth_mode).toBe("dev");
  });

  it("openVikingPaths points at ~/.zap/memory/openviking", () => {
    const paths = openVikingPaths("/home/user");
    expect(paths.root).toBe("/home/user/.zap/memory/openviking");
    expect(paths.conf).toBe("/home/user/.zap/memory/openviking/ov.conf");
  });
});

describe("template artifacts", () => {
  it("systemd unit is loopback-only and uses the rendered config", () => {
    const unit = readFileSync(path.join(heavyDir, "units", "zap-openviking.service"), "utf8");
    expect(unit).toContain("--config");
    expect(unit).toContain(".zap/memory/openviking/ov.conf");
    expect(unit).not.toContain("0.0.0.0");
  });

  it("bake fragment pins openviking and installs under ~/.zap/memory/openviking", () => {
    const bake = readFileSync(path.join(heavyDir, "bake.d", "40-openviking.sh"), "utf8");
    expect(bake).toMatch(/openviking\[local-embed\]==\d+\.\d+\.\d+/);
    expect(bake).toMatch(/openviking-sdk==\d+\.\d+\.\d+/);
    expect(bake).toContain(".zap/memory/openviking/venv");
    expect(bake).toContain("--python 3.12");
    expect(bake).toContain("chmod 700");
    expect(bake).not.toContain("0.0.0.0");
  });
});

describe("ovctl", () => {
  function make(files: Record<string, string> = {}) {
    const transport = createInMemoryTransport({
      readFile: async (file) => {
        const text = files[file];
        if (text === undefined) throw new Error(`no such file: ${file}`);
        return text;
      },
    });
    const written = new Map<string, string>();
    let restarts = 0;
    const ovctl = createOvctl({
      transport,
      home: "/home/user",
      readFile: async (file) => {
        const text = written.get(file);
        if (text === undefined) throw new Error("missing");
        return text;
      },
      writeFile: async (file, text) => {
        written.set(file, text);
      },
      mkdir: async () => undefined,
      restartService: async () => {
        restarts += 1;
      },
    });
    return { ovctl, transport, written, restartCount: () => restarts };
  }

  it("ensure renders the conf once and is idempotent", async () => {
    const { ovctl, written, restartCount } = make();
    const first = await ovctl.ensure();
    expect(first.ok).toBe(true);
    expect(first.confChanged).toBe(true);
    expect(restartCount()).toBe(1);
    expect(written.get("/home/user/.zap/memory/openviking/ov.conf")).toContain("127.0.0.1");
    const second = await ovctl.ensure();
    expect(second.confChanged).toBe(false);
  });

  it("status reports counts, never memory content (canary)", async () => {
    const canary = "CANARY-9f31-memory-bytes";
    const { ovctl, transport } = make();
    await transport.write("viking://user/tenant-1/memories/x", { text: canary });
    const status = await ovctl.status();
    expect(status.healthy).toBe(true);
    expect(JSON.stringify(status)).not.toContain(canary);
  });

  it("add-resource, rm, reindex, export round-trip", async () => {
    const { ovctl } = make({ "/home/user/ctx/a.md": "alpha resource" });
    const added = await ovctl.addResource("/home/user/ctx/a.md", "viking://user/tenant-1/resources/a");
    expect(added.ok).toBe(true);
    const exported = await ovctl.export();
    expect(exported.resources).toContain("viking://user/tenant-1/resources/a");
    await ovctl.rm("viking://user/tenant-1/resources/a");
    const after = await ovctl.export();
    expect(after.resources).not.toContain("viking://user/tenant-1/resources/a");
    const reindexed = await ovctl.reindex([{ path: "/home/user/ctx/a.md", to: "viking://user/tenant-1/resources/a" }]);
    expect(reindexed.added).toContain("viking://user/tenant-1/resources/a");
  });
});

describe("MCP registration fragments", () => {
  it("hermes: config.yaml mcp_servers.openviking.url", () => {
    const fragment = mcpRegistrationFragment("hermes");
    expect(fragment.kind).toBe("yaml");
    expect(fragment.fragment).toContain("mcp_servers:");
    expect(fragment.fragment).toContain("openviking:");
    expect(fragment.fragment).toContain(`url: ${OPENVIKING_MCP_URL}`);
  });

  it("openclaw: mcp.servers", () => {
    const fragment = mcpRegistrationFragment("openclaw");
    const parsed = JSON.parse(fragment.fragment) as { mcp: { servers: Record<string, { url: string }> } };
    expect(parsed.mcp.servers.openviking?.url).toBe(OPENVIKING_MCP_URL);
  });

  it("opencode: mcp.<name> remote", () => {
    const fragment = mcpRegistrationFragment("opencode");
    const parsed = JSON.parse(fragment.fragment) as { mcp: Record<string, { type: string; url: string }> };
    expect(parsed.mcp.openviking).toEqual({ type: "remote", url: OPENVIKING_MCP_URL });
  });

  it("interpreter: TOML [mcp_servers.openviking]", () => {
    const fragment = mcpRegistrationFragment("interpreter");
    expect(fragment.kind).toBe("toml");
    expect(fragment.fragment).toContain("[mcp_servers.openviking]");
    expect(fragment.fragment).toContain(`url = "${OPENVIKING_MCP_URL}"`);
  });

  it("cursor: .cursor/mcp.json", () => {
    const fragment = mcpRegistrationFragment("cursor");
    expect(fragment.path).toBe(".cursor/mcp.json");
    const parsed = JSON.parse(fragment.fragment) as { mcpServers: Record<string, { url: string }> };
    expect(parsed.mcpServers.openviking?.url).toBe(OPENVIKING_MCP_URL);
  });

  it("pi: extension config", () => {
    const fragment = mcpRegistrationFragment("pi");
    const parsed = JSON.parse(fragment.fragment) as { mcpServers: Record<string, { url: string }> };
    expect(parsed.mcpServers.openviking?.url).toBe(OPENVIKING_MCP_URL);
  });

  it("fx: /mcp add --transport http", () => {
    const fragment = mcpRegistrationFragment("fx");
    expect(fragment.kind).toBe("command");
    expect(fragment.fragment).toBe(`/mcp add --transport http openviking ${OPENVIKING_MCP_URL}`);
  });

  it("custom name and url override the defaults", () => {
    const fragment = mcpRegistrationFragment("opencode", { name: "memory", url: "http://127.0.0.1:1933/mcp" });
    const parsed = JSON.parse(fragment.fragment) as { mcp: Record<string, { type: string; url: string }> };
    expect(parsed.mcp.memory?.url).toBe("http://127.0.0.1:1933/mcp");
  });
});
