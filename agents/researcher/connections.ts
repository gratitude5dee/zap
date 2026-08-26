import { defineConnection, defineMcpServer, useSecret, bearer } from "@wzrdtech/zap-agent";
export const webhook = defineConnection({ id: "webhook", origin: "https://hooks.example.com", methods: ["POST"], pathPrefix: "/zap/", headers: { Authorization: bearer(useSecret("WEBHOOK_TOKEN")) } });
export const context7 = defineMcpServer({ id: "context7", url: "https://mcp.context7.com/mcp", headers: { CONTEXT7_API_KEY: useSecret("CONTEXT7_API_KEY") } });
