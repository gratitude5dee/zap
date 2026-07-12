import path from "node:path";
import type { SandboxNetworkPolicy, SandboxSession } from "eve/sandbox";

export type SandboxDriver = {
  id: string;
  read(path: string): Promise<Uint8Array | null>;
  remove(path: string, recursive: boolean, force: boolean): Promise<void>;
  run(input: { abortSignal?: AbortSignal; command: string; env?: Record<string, string>; workingDirectory?: string }): Promise<{ exitCode: number; stderr: string; stdout: string }>;
  setNetworkPolicy?(policy: SandboxNetworkPolicy): Promise<void>;
  shutdown(): Promise<void>;
  write(path: string, content: Uint8Array): Promise<void>;
};

export function buildVendorSandboxSession(driver: SandboxDriver): SandboxSession {
  const resolvePath = (value: string) => value.startsWith("/") ? path.posix.normalize(value) : path.posix.join("/workspace", value);
  const run = (options: Parameters<SandboxSession["run"]>[0]) => driver.run({
    ...options,
    workingDirectory: options.workingDirectory ? resolvePath(options.workingDirectory) : "/workspace",
  });
  const readBinaryFile = async (options: Parameters<SandboxSession["readBinaryFile"]>[0]) => {
    options.abortSignal?.throwIfAborted();
    return driver.read(resolvePath(options.path));
  };
  const writeBinaryFile = async (options: Parameters<SandboxSession["writeBinaryFile"]>[0]) => {
    options.abortSignal?.throwIfAborted();
    await driver.write(resolvePath(options.path), options.content);
  };

  return {
    id: driver.id,
    readBinaryFile,
    async readFile(options) {
      const content = await readBinaryFile(options);
      if (!content) return null;
      return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(content); controller.close(); } });
    },
    async readTextFile(options) {
      const content = await readBinaryFile(options);
      if (!content) return null;
      const text = Buffer.from(content).toString((options.encoding ?? "utf8") as BufferEncoding);
      if (options.startLine === undefined && options.endLine === undefined) return text;
      const lines = text.split("\n");
      return lines.slice(Math.max(0, (options.startLine ?? 1) - 1), options.endLine).join("\n");
    },
    async removePath(options) {
      options.abortSignal?.throwIfAborted();
      await driver.remove(resolvePath(options.path), Boolean(options.recursive), Boolean(options.force));
    },
    resolvePath,
    run,
    async setNetworkPolicy(policy) {
      if (!driver.setNetworkPolicy) throw new Error("This sandbox provider cannot enforce the requested network policy.");
      await driver.setNetworkPolicy(policy);
    },
    async spawn(options) {
      const stdout = new TransformStream<Uint8Array, Uint8Array>();
      const stderr = new TransformStream<Uint8Array, Uint8Array>();
      const stdoutWriter = stdout.writable.getWriter();
      const stderrWriter = stderr.writable.getWriter();
      const encoder = new TextEncoder();
      let killed = false;
      const completed = run(options).then(async (result) => {
        if (result.stdout) await stdoutWriter.write(encoder.encode(result.stdout));
        if (result.stderr) await stderrWriter.write(encoder.encode(result.stderr));
        await Promise.all([stdoutWriter.close(), stderrWriter.close()]);
        return { exitCode: killed ? 137 : result.exitCode };
      }, async (error) => {
        await Promise.all([stdoutWriter.abort(error), stderrWriter.abort(error)]);
        throw error;
      });
      return {
        async kill() { killed = true; await driver.shutdown(); },
        stderr: stderr.readable,
        stdout: stdout.readable,
        wait: () => completed,
      };
    },
    writeBinaryFile,
    async writeFile(options) {
      options.abortSignal?.throwIfAborted();
      const bytes = new Uint8Array(await new Response(options.content).arrayBuffer());
      await driver.write(resolvePath(options.path), bytes);
    },
    async writeTextFile(options) {
      options.abortSignal?.throwIfAborted();
      const bytes = Buffer.from(options.content, (options.encoding ?? "utf8") as BufferEncoding);
      await driver.write(resolvePath(options.path), bytes);
    },
  };
}
