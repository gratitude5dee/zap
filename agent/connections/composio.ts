import { defineMcpClientConnection } from "eve/connections";
import { once } from "eve/tools/approval";

export default defineMcpClientConnection({
  approval: once(),
  description: "Wallet-isolated Composio connectors selected for this Sprite. Mutating tools require human approval.",
  headers: parseHeaders(process.env.COMPOSIO_MCP_HEADERS),
  url: process.env.COMPOSIO_MCP_URL ?? "https://disabled.invalid/composio-mcp",
});

function parseHeaders(value?: string) {
  if (!value) return { "x-zap-connection-disabled": "true" };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("headers must be an object");
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch (error) {
    throw new Error("COMPOSIO_MCP_HEADERS must be a JSON object of string headers.", { cause: error });
  }
}
