// §5.3.1 conformance suite — one suite, every adapter runs it.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBoxProvider,
  createDockerProvider,
  createFakeProvider,
  createLocalProvider,
  type SandboxHandle,
  type SandboxProvider,
  type SandboxSpec,
} from "../src/index.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface AdapterUnderTest {
  name: string;
  /** returns undefined to skip (credential or daemon absent) */
  setup: () => Promise<
    | {
        provider: SandboxProvider;
        workdir: string;
        spec?: Partial<SandboxSpec>;
        /** log lines captured for the C24 hosted-token assertion */
        logBuffer?: string[];
      }
    | undefined
  >;
}

const adapters: AdapterUnderTest[] = [
  {
    name: "fake",
    setup: async () => ({
      provider: createFakeProvider({ env: { ZAP_ALLOW_FAKE_SANDBOX: "1" } }),
      workdir: "/workspace",
    }),
  },
  {
    name: "local",
    setup: async () => {
      const root = mkdtempSync(path.join(tmpdir(), "zap-local-"));
      return {
        provider: createLocalProvider({
          root,
          env: { ZAP_ALLOW_LOCAL_SANDBOX: "1" },
          lanes: {
            allowed: (_lane, argv0) => argv0 === "ffprobe",
            run: async (run) => ({
              id: run.id ?? "lane-1",
              lane: run.lane,
              isolation: "process",
              exitCode: 0,
              stdout: "lane-ok",
              stderr: "",
              timedOut: false,
              truncated: false,
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              usage: { bytesIn: 0, bytesOut: 7 },
            }),
          },
        }),
        workdir: root,
      };
    },
  },
  {
    name: "docker",
    setup: async () => {
      if (process.env.RUN_DOCKER_SANDBOX_TESTS !== "1") return undefined;
      const provider = createDockerProvider({});
      try {
        const report = await provider.doctor();
        if (!report.ok) return undefined;
      } catch {
        return undefined;
      }
      return { provider, workdir: "/workspace" };
    },
  },
  {
    name: "box",
    setup: async () => {
      const apiKey = process.env.BOX_API_KEY;
      if (process.env.RUN_HOSTED_SANDBOX_TESTS !== "1" || !apiKey) return undefined;
      const logBuffer: string[] = [];
      const template = process.env.ZAP_BOX_TEMPLATE ?? "zap-light";
      return {
        provider: createBoxProvider({ apiKey, template, log: (line) => logBuffer.push(line) }),
        workdir: "/workspace",
        logBuffer,
        spec: {
          template,
          env: {
            TENANT_ID: "conformance",
            RUNTIME_ID: "conformance",
            RUNTIME_TOKEN: "conformance-token",
          },
        },
      };
    },
  },
];

for (const adapter of adapters) {
  describe(`sandbox conformance: ${adapter.name}`, async () => {
    const target = await adapter.setup();
    const run = target ? it : it.skip;

    run("passes the contract steps", { timeout: 600_000 }, async () => {
      if (!target) return;
      const { provider, workdir, logBuffer } = target;
      const spec: SandboxSpec = {
        provider: provider.id,
        purpose: "test",
        idempotencyKey: `contract-${provider.id}-${Date.now()}`,
        ...target.spec,
      };
      const handle: SandboxHandle = await provider.acquire(spec);
      const capabilities = handle.capabilities;

      expect(handle.fs.resolve("fixture/input.txt")).toBe(path.posix.join(workdir, "fixture/input.txt"));

      expect((await handle.exec("mkdir -p fixture")).exitCode).toBe(0);
      await handle.fs.write("fixture/input.txt", encoder.encode("zap"));
      const transform = await handle.exec(
        `tr 'a-z' 'A-Z' < input.txt > output.txt && printf ':%s' "$CONTRACT_SUFFIX" >> output.txt`,
        { cwd: "fixture", env: { CONTRACT_SUFFIX: "ready" } },
      );
      expect(transform.exitCode).toBe(0);
      const output = await handle.fs.read("fixture/output.txt");
      expect(output && decoder.decode(output)).toBe("ZAP:ready");

      await handle.fs.remove("fixture", { recursive: true });
      expect(await handle.fs.read("fixture/output.txt")).toBeNull();

      expect((await handle.captureState()).provider).toBe(provider.id);

      let forked: SandboxHandle | undefined;
      if (capabilities.snapshot && capabilities.fork && handle.snapshot && handle.fork) {
        await handle.fs.write("persist.txt", encoder.encode("persisted"));
        await handle.snapshot(`contract-${Date.now()}`);
        forked = await handle.fork({ idempotencyKey: `${spec.idempotencyKey}-fork`, purpose: "test" });
        const persisted = await forked.fs.read("persist.txt");
        expect(persisted && decoder.decode(persisted)).toBe("persisted");
      }

      if (capabilities.stop && capabilities.resume && handle.stop && handle.resume) {
        await handle.fs.write("survives.txt", encoder.encode("still-here"));
        await handle.stop();
        expect(await handle.state()).toBe("stopped");
        await handle.resume();
        const survived = await handle.fs.read("survives.txt");
        expect(survived && decoder.decode(survived)).toBe("still-here");
      }

      if (capabilities.ports && capabilities.privatePorts && handle.host) {
        const hosted = await handle.host(8080, { private: true });
        expect(hosted.url).toMatch(/^https:\/\//);
        expect(hosted.isPrivate).toBe(true);
        if (hosted.token && logBuffer) {
          // C24: hosted tokens never reach the log buffer
          expect(logBuffer.join("\n")).not.toContain(hosted.token);
        }
      }

      if (forked) await forked.release();
      await handle.release();
      await handle.release(); // twice is a no-op
      await expect(handle.exec("pwd")).rejects.toMatchObject({ code: "SANDBOX_RELEASED" });
    });
  });
}
