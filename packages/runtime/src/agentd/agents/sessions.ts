// Durable sessions (§5.12): /zap/sessions/<id>/{meta.json,turns.jsonl,
// messages.jsonl,data.json}. Content stays in the VM; only meta mirrors out.
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TurnMessage } from "@wzrdtech/zap-agent";

export interface SessionMeta {
  id: string;
  agent: string;
  alias: string;
  deploymentId: string;
  createdAt: string;
  lastActiveAt: string;
  turns: number;
  status: "idle" | "running";
}

export interface TurnRecord {
  turn: number;
  live: boolean;
  payer: string;
  text?: string;
  code?: string;
  usage?: unknown;
  at: string;
}

export interface SessionStore {
  create(input: { agent: string; alias: string; deploymentId: string; id?: string }): Promise<SessionMeta>;
  get(id: string): Promise<SessionMeta | null>;
  list(): Promise<SessionMeta[]>;
  update(id: string, patch: Partial<SessionMeta>): Promise<SessionMeta>;
  appendTurn(id: string, record: TurnRecord): Promise<void>;
  appendMessages(id: string, messages: readonly TurnMessage[]): Promise<void>;
  readMessages(id: string): Promise<TurnMessage[]>;
  getData(id: string): Promise<Record<string, unknown>>;
  setData(id: string, data: Record<string, unknown>): Promise<void>;
}

export function createSessionStore(root: string): SessionStore {
  const base = path.join(root, "sessions");
  const dirOf = (id: string): string => path.join(base, id);

  async function readMeta(id: string): Promise<SessionMeta | null> {
    const raw = await fs.readFile(path.join(dirOf(id), "meta.json"), "utf8").catch(() => null);
    return raw === null ? null : (JSON.parse(raw) as SessionMeta);
  }

  async function writeMeta(meta: SessionMeta): Promise<void> {
    await fs.writeFile(path.join(dirOf(meta.id), "meta.json"), JSON.stringify(meta, null, 2));
  }

  return {
    async create(input) {
      const now = new Date().toISOString();
      const meta: SessionMeta = {
        id: input.id ?? randomUUID(),
        agent: input.agent,
        alias: input.alias,
        deploymentId: input.deploymentId,
        createdAt: now,
        lastActiveAt: now,
        turns: 0,
        status: "idle",
      };
      await fs.mkdir(dirOf(meta.id), { recursive: true });
      await writeMeta(meta);
      return meta;
    },
    get: readMeta,
    async list() {
      const ids = await fs.readdir(base).catch(() => []);
      const metas: SessionMeta[] = [];
      for (const id of ids) {
        const meta = await readMeta(id);
        if (meta) metas.push(meta);
      }
      return metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async update(id, patch) {
      const meta = await readMeta(id);
      if (!meta) throw new Error(`unknown session ${id}`);
      const next = { ...meta, ...patch, id: meta.id };
      await writeMeta(next);
      return next;
    },
    async appendTurn(id, record) {
      await fs.appendFile(path.join(dirOf(id), "turns.jsonl"), `${JSON.stringify(record)}\n`);
    },
    async appendMessages(id, messages) {
      const lines = messages.map((message) => `${JSON.stringify(message)}\n`).join("");
      await fs.appendFile(path.join(dirOf(id), "messages.jsonl"), lines);
    },
    async readMessages(id) {
      const raw = await fs.readFile(path.join(dirOf(id), "messages.jsonl"), "utf8").catch(() => "");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as TurnMessage);
    },
    async getData(id) {
      const raw = await fs.readFile(path.join(dirOf(id), "data.json"), "utf8").catch(() => null);
      return raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
    },
    async setData(id, data) {
      await fs.writeFile(path.join(dirOf(id), "data.json"), JSON.stringify(data, null, 2));
    },
  };
}
