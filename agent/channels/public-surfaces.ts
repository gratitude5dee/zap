import { defineChannel, GET, POST } from "eve/channels";
import { agentManifest } from "../../lib/agent-manifest";
import { createPublicZapPlanResponse } from "../../lib/public-zap-plan";
import { recordProviderWebhook } from "../../lib/provider-webhooks";
import { z } from "zod";

const webhookProviderSchema = z.enum(["fal", "gmi", "prodia", "runware"]);

export default defineChannel({
  cors: {
    allowHeaders: ["content-type", "x-zap-webhook-secret"],
    methods: ["GET", "POST"],
    origin: [process.env.ZAP_PUBLIC_ORIGIN ?? "https://zap.wzrd.tech"],
  },
  routes: [
    GET("/.agent", async () => manifestResponse()),
    GET("/.well-known/:manifest", async (_request, { params }) =>
      params.manifest === "agent.json"
        ? manifestResponse()
        : new Response("Not found", { status: 404 })),
    POST("/zaps/:slug/plan", (request, { params }) => createPublicZapPlanResponse(request, params.slug)),
    POST("/providers/:provider/webhook", async (request, { params }) => {
      const secret = process.env.ZAP_PROVIDER_WEBHOOK_SECRET;
      const supplied = request.headers.get("x-zap-webhook-secret") ?? new URL(request.url).searchParams.get("secret");
      if ((secret && supplied !== secret) || (!secret && process.env.NODE_ENV === "production")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const provider = webhookProviderSchema.parse(params.provider);
        const result = await recordProviderWebhook(provider, await request.json(), { url: request.url });
        return Response.json({ ok: true, result });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Webhook failed." }, { status: 400 });
      }
    }),
  ],
});

function manifestResponse() {
  return Response.json(agentManifest, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
