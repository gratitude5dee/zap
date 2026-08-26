import { defineConnection, useSecret, bearer } from "@wzrdtech/zap-agent";
export const webhook = defineConnection({ id: "webhook", origin: "https://hooks.example.com", methods: ["POST"], pathPrefix: "/zap/", headers: { Authorization: bearer(useSecret("WEBHOOK_TOKEN")) } });
