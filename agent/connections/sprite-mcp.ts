import { defineMcpClientConnection } from "eve/connections";
import { once } from "eve/tools/approval";

const connection = firstMcpConnection(process.env.SPRITE_CONNECTIONS);

export default defineMcpClientConnection({
  approval: once(),
  description: connection
    ? `User-selected Sprite MCP connection: ${connection.id}.`
    : "Disabled placeholder for an optional user-selected Sprite MCP connection.",
  url: connection?.url ?? "https://disabled.invalid/sprite-mcp",
});

function firstMcpConnection(value?: string) {
  if (!value) return null;
  try {
    const connections = JSON.parse(value) as unknown;
    if (!Array.isArray(connections)) return null;
    for (const candidate of connections) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as Record<string, unknown>;
      if (record.kind === "mcp" && typeof record.id === "string" && typeof record.url === "string") {
        return { id: record.id, url: record.url };
      }
    }
    return null;
  } catch {
    return null;
  }
}
