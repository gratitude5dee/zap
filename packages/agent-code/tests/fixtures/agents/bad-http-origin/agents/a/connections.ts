import { defineConnection, useSecret, bearer } from "@wzrdtech/zap-agent";
export const api = defineConnection({
  id: "api",
  origin: "http://api.example.com" as `https://${string}`,
  methods: ["GET"],
  pathPrefix: "/v1/",
  headers: { Authorization: bearer(useSecret("API_TOKEN")) },
});
