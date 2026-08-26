// API store (§5.10, C10): catalog APIs attach through Composio,
// open-connector, and Context7 — not 80 first-party adapters.
export { MCP_CONFIG_FORMATS, renderMcpFragment, type McpConfigFormat, type McpServerFragment } from "./fragments.ts";
export { CONTEXT7_MCP_URL, context7, context7Fragment, context7McpServer, type Context7PluginConfig } from "./context7.ts";
export {
  OPEN_CONNECTOR_HOST,
  OPEN_CONNECTOR_MCP_URL,
  OPEN_CONNECTOR_PORT,
  OPEN_CONNECTOR_REF,
  OPEN_CONNECTOR_REPO,
  openConnector,
  openConnectorFragment,
  openConnectorMcpServer,
  openConnectorUnit,
  type OpenConnectorPluginConfig,
} from "./open-connector.ts";
export { composio, composioFragment, composioMcpServer, type ComposioPluginConfig, type ComposioSession } from "./composio.ts";

import catalogJson from "./catalog.json" with { type: "json" };

export type CatalogVia = "composio" | "open-connector" | "context7" | "first-party";

export interface CatalogEntry {
  id: string;
  name: string;
  kinds: string[];
  via: CatalogVia;
}

export const catalog: readonly CatalogEntry[] = catalogJson as CatalogEntry[];
