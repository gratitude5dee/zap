// Alias pointers (§5.12): /zap/aliases/<alias> plus an append-only
// history.jsonl. Moving an alias never touches deployments or sessions.
import { promises as fs } from "node:fs";
import path from "node:path";

export interface AliasPointer {
  alias: string;
  deploymentId: string;
  movedAt: string;
  by: string;
}

export interface AliasStore {
  move(alias: string, deploymentId: string, by: string): Promise<AliasPointer>;
  get(alias: string): Promise<AliasPointer | null>;
  history(): Promise<AliasPointer[]>;
}

export function createAliasStore(root: string): AliasStore {
  const base = path.join(root, "aliases");

  return {
    async move(alias, deploymentId, by) {
      const pointer: AliasPointer = { alias, deploymentId, movedAt: new Date().toISOString(), by };
      await fs.mkdir(base, { recursive: true });
      await fs.writeFile(path.join(base, alias), JSON.stringify(pointer, null, 2));
      await fs.appendFile(path.join(base, "history.jsonl"), `${JSON.stringify(pointer)}\n`);
      return pointer;
    },
    async get(alias) {
      const raw = await fs.readFile(path.join(base, alias), "utf8").catch(() => null);
      return raw === null ? null : (JSON.parse(raw) as AliasPointer);
    },
    async history() {
      const raw = await fs.readFile(path.join(base, "history.jsonl"), "utf8").catch(() => "");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AliasPointer);
    },
  };
}
