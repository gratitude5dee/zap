// Connectivity is opt-in and default-off. These tests pin the contract that
// makes that claim checkable: nothing starts unless an owner enables it,
// enable/disable are idempotent, the task router stays on loopback, and a
// mesh join needs the owner's own control plane — there is no fallback URL.
import { afterEach, describe, expect, it } from "vitest";
import { resetRedaction } from "../src/auth/redact.ts";
import {
  CONNECTIVITY_FEATURES,
  ConnectivityInputError,
  cotalStatus,
  defaultConnectivity,
  disableCotal,
  disableSamMesh,
  disableTailscale,
  disableTaskrouter,
  enableCotal,
  enableSamMesh,
  enableTailscale,
  enableTaskrouter,
  samMeshStatus,
  tailscaleStatus,
  taskrouterStatus,
  type ConnectivityBox,
} from "../src/connectivity/index.ts";

interface Call {
  command: string;
}

function fakeBox(respond: (command: string) => { stdout?: string; stderr?: string; exitCode?: number }) {
  const calls: Call[] = [];
  const files: Array<{ path: string; content: string }> = [];
  const box: ConnectivityBox = {
    exec: async (command: string) => {
      calls.push({ command });
      const result = respond(command);
      return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.exitCode ?? 0 };
    },
    writeFile: async (path: string, content: string) => {
      files.push({ path, content });
    },
  };
  return { box, calls, files };
}

afterEach(() => resetRedaction());

describe("default-off contract", () => {
  it("every connectivity feature defaults to false", () => {
    const defaults = defaultConnectivity();
    for (const feature of CONNECTIVITY_FEATURES) {
      expect(defaults[feature]).toBe(false);
    }
  });

  it("status on an untouched box reports installed-but-not-running", async () => {
    const { box } = fakeBox((command) => {
      if (command.includes("tailscale")) return { stdout: "down" };
      if (command.includes("cotal")) return { stdout: "down" };
      if (command.includes("taskrouter")) return { stdout: "installed" };
      return { stdout: "installed" };
    });
    expect(await tailscaleStatus(box)).toEqual({ installed: true, running: false, dnsName: null });
    expect(await cotalStatus(box)).toEqual({ installed: true, running: false });
    expect((await taskrouterStatus(box)).running).toBe(false);
    expect(await samMeshStatus(box)).toEqual({ installed: true, running: false, enrolled: false, controlPlaneUrl: null });
  });
});

describe("tailscale joins the owner's own tailnet", () => {
  it("rejects anything that is not a tailscale auth key", async () => {
    const { box, calls } = fakeBox(() => ({ stdout: "up" }));
    await expect(enableTailscale(box, { authKey: "not-a-key" })).rejects.toBeInstanceOf(ConnectivityInputError);
    expect(calls).toHaveLength(0);
  });

  it("delivers the auth key by one-shot file, never on the command line", async () => {
    const authKey = "tskey-auth-canary000000000000000";
    const { box, calls, files } = fakeBox((command) => (command.includes("status --json") ? { stdout: '{"BackendState":"Running","Self":{"DNSName":"box.tail.ts.net."}}' } : { stdout: "" }));
    const status = await enableTailscale(box, { authKey });
    expect(status.running).toBe(true);
    expect(files.some((file) => file.content === authKey)).toBe(true);
    for (const call of calls) expect(call.command).not.toContain(authKey);
    expect(calls.some((call) => call.command.includes("--auth-key=file:"))).toBe(true);
    // the one-shot file is shredded on the way out
    expect(calls.some((call) => call.command.includes("shred"))).toBe(true);
  });

  it("enable is idempotent when the tailnet is already joined", async () => {
    const authKey = "tskey-auth-canary000000000000000";
    const { box } = fakeBox(() => ({ stdout: '{"BackendState":"Running","Self":{"DNSName":"box.tail.ts.net."}}' }));
    const first = await enableTailscale(box, { authKey });
    const second = await enableTailscale(box, { authKey });
    expect(second).toEqual(first);
  });

  it("disable is idempotent on a box that never joined", async () => {
    const { box } = fakeBox(() => ({ stdout: "missing" }));
    await expect(disableTailscale(box)).resolves.toBeUndefined();
    await expect(disableTailscale(box)).resolves.toBeUndefined();
  });
});

describe("cotal stays box-local", () => {
  it("enable/disable only ever touch the local daemon", async () => {
    const { box, calls } = fakeBox(() => ({ stdout: "up" }));
    await enableCotal(box);
    await disableCotal(box);
    await disableCotal(box);
    for (const call of calls) {
      expect(call.command).not.toMatch(/https?:\/\//);
    }
  });
});

describe("taskrouter is advisory and loopback-only", () => {
  it("enable never exposes the router beyond 127.0.0.1", async () => {
    const { box, calls } = fakeBox(() => ({ stdout: "running" }));
    await enableTaskrouter(box);
    const joined = calls.map((call) => call.command).join(" ");
    expect(joined).not.toContain("0.0.0.0");
    expect(joined).toContain("127.0.0.1:1917");
  });

  it("reports heuristic mode when the model is absent instead of failing", async () => {
    const { box } = fakeBox((command) => (command.includes("model.gguf") ? { exitCode: 1, stdout: "" } : { stdout: "running" }));
    const status = await taskrouterStatus(box);
    expect(status.modelPresent).toBe(false);
    expect(status.mode).toBe("heuristic");
  });

  it("disable is idempotent", async () => {
    const { box } = fakeBox(() => ({ stdout: "" }));
    await expect(disableTaskrouter(box)).resolves.toBeUndefined();
    await expect(disableTaskrouter(box)).resolves.toBeUndefined();
  });
});

describe("sam mesh joins only the owner's own mesh", () => {
  it("refuses to enable without an owner-supplied control plane", async () => {
    const { box, calls } = fakeBox(() => ({ stdout: "" }));
    await expect(
      enableSamMesh(box, { controlPlaneUrl: "", bootstrapToken: "bt-canary-000000000000" }),
    ).rejects.toBeInstanceOf(ConnectivityInputError);
    expect(calls).toHaveLength(0);
  });

  it("refuses a public/community mesh endpoint", async () => {
    const { box } = fakeBox(() => ({ stdout: "" }));
    for (const url of ["https://bananas.sam-mesh.dev", "https://hub.sam-mesh.dev"]) {
      await expect(
        enableSamMesh(box, { controlPlaneUrl: url, bootstrapToken: "bt-canary-000000000000" }),
      ).rejects.toBeInstanceOf(ConnectivityInputError);
    }
  });

  it("requires https for the owner's control plane", async () => {
    const { box } = fakeBox(() => ({ stdout: "" }));
    await expect(
      enableSamMesh(box, { controlPlaneUrl: "http://mesh.example.com", bootstrapToken: "bt-canary-000000000000" }),
    ).rejects.toBeInstanceOf(ConnectivityInputError);
  });

  it("never puts the bootstrap token or api token on the command line", async () => {
    const bootstrapToken = "bt-canary-samsecret-0001";
    const { box, calls, files } = fakeBox((command) =>
      command.includes("mesh-status")
        ? { stdout: JSON.stringify({ installed: true, running: true, enrolled: true, controlPlaneUrl: "https://mesh.example.com" }) }
        : { stdout: "" },
    );
    const status = await enableSamMesh(box, { controlPlaneUrl: "https://mesh.example.com", bootstrapToken });
    expect(status.enrolled).toBe(true);
    expect(files.some((file) => file.content === bootstrapToken)).toBe(true);
    for (const call of calls) expect(call.command).not.toContain(bootstrapToken);
    // enrollment happens inside the unit's launcher, which reads the 0600 file
    expect(calls.some((call) => call.command.includes("systemctl enable --now zap-sam-mesh.service"))).toBe(true);
  });

  it("never uses mesh-llm public discovery", async () => {
    const { box, calls } = fakeBox(() => ({ stdout: "" }));
    await enableSamMesh(box, {
      controlPlaneUrl: "https://mesh.example.com",
      bootstrapToken: "bt-canary-samsecret-0001",
      meshInviteToken: "invite-canary-0001",
    });
    const joined = calls.map((call) => call.command).join(" ");
    expect(joined).not.toContain("--auto");
    expect(joined).not.toContain("--discover");
    expect(joined).not.toContain("sam-mesh.dev");
  });

  it("disable removes the owner's credentials and is idempotent", async () => {
    const { box, calls } = fakeBox(() => ({ stdout: "" }));
    await disableSamMesh(box);
    await disableSamMesh(box);
    const joined = calls.map((call) => call.command).join(" ");
    expect(joined).toContain("bootstrap-token");
    expect(joined).toContain("systemctl disable");
  });
});
