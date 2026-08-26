import { defineConnection } from "@wzrdtech/zap-agent";
export const api = defineConnection({
  id: "api",
  origin: "https://api.example.com",
  methods: ["GET"],
  pathPrefix: "/v1/",
  headers: { Authorization: "Bearer hardcoded-token-123" },
});
