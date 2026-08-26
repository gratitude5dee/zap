import { execFile } from "node:child_process";
import { mkdir as fsMkdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { openVikingPaths, renderOvConf, type OpenVikingTransport } from "./openviking.ts";
import { kindOfUri } from "./uris.ts";

const execFileAsync = promisify(execFile);

export interface OvctlDeps {
  transport: OpenVikingTransport;
  home?: string;
  readFile?: (filePath: string) => Promise<string>;
  writeFile?: (filePath: string, text: string) => Promise<void>;
  mkdir?: (dirPath: string) => Promise<unknown>;
  /** default restarts zap-openviking.service via systemctl, best effort */
  restartService?: () => Promise<void>;
  /** health poll attempts after a restart */
  healthAttempts?: number;
}

export interface Ovctl {
  ensure(): Promise<{ ok: boolean; confChanged: boolean }>;
  /** Metadata only — counts and byte totals, never memory content (C4). */
  status(): Promise<{ healthy: boolean; resources: number; items: number; workspaceBytes: number }>;
  addResource(filePath: string, to: string): Promise<{ ok: boolean; uri: string }>;
  rm(uri: string): Promise<{ ok: true; uri: string }>;
  reindex(entries: ReadonlyArray<{ path: string; to: string }>): Promise<{ ok: true; added: string[] }>;
  /** I6 extraction path: URI inventory plus memory contents (content — VM/self-host only). */
  export(): Promise<{ resources: string[]; memories: Array<{ uri: string; content?: string }> }>;
}

/** TypeScript port of the box-side ovctl: ensure | status | add-resource | rm | reindex | export. */
export function createOvctl(deps: OvctlDeps): Ovctl {
  const home = deps.home ?? os.homedir();
  const paths = openVikingPaths(home);
  const readFile = deps.readFile ?? (async (filePath: string) => fsReadFile(filePath, "utf8"));
  const writeFile =
    deps.writeFile ?? (async (filePath: string, text: string) => fsWriteFile(filePath, text, { mode: 0o600 }));
  const mkdir = deps.mkdir ?? (async (dirPath: string) => fsMkdir(dirPath, { recursive: true, mode: 0o700 }));
  const restartService =
    deps.restartService ??
    (async () => {
      await execFileAsync("systemctl", ["restart", "zap-openviking.service"]).catch(() => undefined);
    });
  const { transport } = deps;

  return {
    async ensure() {
      await mkdir(paths.root);
      const desired = renderOvConf({ home });
      let current: string | null = null;
      try {
        current = await readFile(paths.conf);
      } catch {
        current = null;
      }
      const confChanged = current !== desired;
      if (confChanged) await writeFile(paths.conf, desired);
      if (confChanged || !(await transport.healthy())) await restartService();
      const attempts = deps.healthAttempts ?? 30;
      for (let i = 0; i < attempts; i += 1) {
        if (await transport.healthy()) return { ok: true, confChanged };
        await new Promise((resolve) => setTimeout(resolve, i === 0 ? 0 : 1000));
      }
      return { ok: false, confChanged };
    },

    async status() {
      const healthy = await transport.healthy();
      if (!healthy) return { healthy: false, resources: 0, items: 0, workspaceBytes: 0 };
      const rows = await transport.list("viking://user");
      let workspaceBytes = 0;
      let resources = 0;
      for (const row of rows) {
        workspaceBytes += Buffer.byteLength(row.text ?? "", "utf8");
        if (kindOfUri(row.uri) === "resource") resources += 1;
      }
      return { healthy: true, resources, items: rows.length, workspaceBytes };
    },

    async addResource(filePath, to) {
      const absolute = path.isAbsolute(filePath) ? filePath : path.join(home, filePath);
      await transport.rm(to, { recursive: true });
      await transport.addResource(absolute, to);
      return { ok: true, uri: to };
    },

    async rm(uri) {
      await transport.rm(uri, { recursive: true });
      return { ok: true, uri };
    },

    async reindex(entries) {
      const added: string[] = [];
      for (const entry of entries) {
        await transport.rm(entry.to, { recursive: true });
        await transport.addResource(entry.path, entry.to);
        added.push(entry.to);
      }
      return { ok: true, added };
    },

    async export() {
      const rows = await transport.list("viking://user");
      const resources: string[] = [];
      const memories: Array<{ uri: string; content?: string }> = [];
      for (const row of rows) {
        if (kindOfUri(row.uri) === "resource") {
          resources.push(row.uri);
        } else {
          memories.push({ uri: row.uri, ...(row.text !== undefined ? { content: row.text } : {}) });
        }
      }
      return { resources, memories };
    },
  };
}
