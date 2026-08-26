// apistore.open-connector — self-hosts the oomol open-connector MCP inside
// the VM. Install is pinned (bake.d/50-apistore.sh clones OPEN_CONNECTOR_REF
// and runs npm ci); the service binds 127.0.0.1:3000 only and reads
// OOMOL_CONNECT_* from the per-box env — the unit file itself carries no
// secret value (C6/C15, loopback-only per Z8).
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { renderMcpFragment, type McpConfigFormat, type McpServerFragment } from "./fragments.ts";

export const OPEN_CONNECTOR_HOST = "127.0.0.1";
export const OPEN_CONNECTOR_PORT = 3000;
export const OPEN_CONNECTOR_MCP_URL = `http://${OPEN_CONNECTOR_HOST}:${OPEN_CONNECTOR_PORT}/mcp`;
/** Pinned git ref baked by packages/templates/zap-heavy/bake.d/50-apistore.sh. */
export const OPEN_CONNECTOR_REPO = "https://github.com/oomol-lab/open-connector.git";
export const OPEN_CONNECTOR_REF = "v0.1.0";

export interface OpenConnectorPluginConfig {
  port?: number;
}

const schema = z
  .object({
    port: z.number().int().positive().optional(),
  })
  .optional();

export function openConnectorMcpServer(config?: OpenConnectorPluginConfig): McpServerFragment {
  const port = config?.port ?? OPEN_CONNECTOR_PORT;
  return {
    id: "open-connector",
    url: `http://${OPEN_CONNECTOR_HOST}:${port}/mcp`,
  };
}

export function openConnectorFragment(format: McpConfigFormat, config?: OpenConnectorPluginConfig): string {
  return renderMcpFragment(format, openConnectorMcpServer(config));
}

/** systemd unit for the in-VM service. OOMOL_CONNECT_* values come from the
 * per-box environment file, never inline. */
export function openConnectorUnit(config?: OpenConnectorPluginConfig): string {
  const port = config?.port ?? OPEN_CONNECTOR_PORT;
  return [
    "[Unit]",
    "Description=Zap open-connector MCP (loopback only)",
    "After=network.target",
    "",
    "[Service]",
    "Type=simple",
    "User=user",
    "WorkingDirectory=/opt/zap/open-connector",
    "EnvironmentFile=/etc/zap/box.env",
    `Environment=HOST=${OPEN_CONNECTOR_HOST}`,
    `Environment=PORT=${port}`,
    `ExecStart=/usr/bin/node server.js --host ${OPEN_CONNECTOR_HOST} --port ${port}`,
    "Restart=on-failure",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
  ].join("\n");
}

export const openConnector = definePlugin<OpenConnectorPluginConfig | undefined>({
  name: "apistore.open-connector",
  schema,
  async apply(ctx, config) {
    const server = openConnectorMcpServer(config);
    await ctx.effect(() =>
      ctx.provide("apistore.open-connector", {
        fragment: (format: McpConfigFormat) => renderMcpFragment(format, server),
        server,
        unit: openConnectorUnit(config),
      }),
    );
  },
});
