// Session metadata mirror (§5.12): only meta leaves the VM — never turns,
// messages, or session data.
export interface AgentSessionRow {
  id: string;
  tenantId: string;
  runtimeId: string;
  agent: string;
  alias: string;
  deploymentId: string;
  createdAt: string;
  lastActiveAt: string;
  turns: number;
}

export interface AgentSessionStore {
  insert(row: AgentSessionRow): Promise<void>;
  get(id: string): Promise<AgentSessionRow | null>;
  list(tenantId: string): Promise<AgentSessionRow[]>;
  update(id: string, patch: Partial<AgentSessionRow>): Promise<void>;
}

export function memoryAgentSessionStore(): AgentSessionStore {
  const rows = new Map<string, AgentSessionRow>();
  return {
    async insert(row) {
      rows.set(row.id, row);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async list(tenantId) {
      return [...rows.values()]
        .filter((row) => row.tenantId === tenantId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, ...patch, id: row.id });
    },
  };
}
