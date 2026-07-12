import { z } from "zod";

const relativeEndpointSchema = z.string().startsWith("/");

export const agentManifestSchema = z.object({
  authModes: z.array(z.enum(["byok", "wzrd-cloud"])).min(1),
  description: z.string().min(1),
  endpoints: z.object({
    chatWebhooks: z.record(z.string(), relativeEndpointSchema),
    eve: relativeEndpointSchema,
    zapCatalog: relativeEndpointSchema,
  }),
  name: z.string().min(1),
  protocols: z.record(z.string(), z.unknown()),
  supportedChannels: z.array(z.string()),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  zapCatalogUrl: relativeEndpointSchema,
});

export type AgentManifest = z.infer<typeof agentManifestSchema>;

export const agentManifest: AgentManifest = agentManifestSchema.parse({
  authModes: ["byok", "wzrd-cloud"],
  description: "Eve-native agent for discovering, planning, authoring, and running Zap media recipes.",
  endpoints: {
    chatWebhooks: {
      imessage: "/eve/v1/imessage",
      slack: "/eve/v1/slack",
      telegram: "/eve/v1/telegram",
    },
    eve: "/eve",
    zapCatalog: "/api/zaps",
  },
  name: "Zap",
  protocols: {},
  supportedChannels: ["web", "slack", "telegram", "imessage-beta"],
  version: "0.3.0",
  zapCatalogUrl: "/api/zaps",
});

export function createAgentManifestResponse() {
  return new Response(JSON.stringify(agentManifest), {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
