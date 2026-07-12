import "server-only";
import { createHash } from "node:crypto";
import { Vercel } from "@vercel/sdk";
import { resolveSpriteSandboxPreset, type SpriteSpec } from "@wzrdtech/core";
import type { SpriteComposioSession } from "./sprite-composio";
import type { SpriteRecord } from "./sprite-store";

const inheritedEnvKeys = [
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "CHANNEL_LINK_SECRET",
  "CONVEX_URL",
  "E2B_API_KEY",
  "FAL_KEY",
  "GMI_API_KEY",
  "IMESSAGE_BRIDGE_TOKEN",
  "IMESSAGE_BRIDGE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "PRODIA_API_KEY",
  "REDIS_URL",
  "RUNWARE_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_TENANT_ID",
  "TELEGRAM_WEBHOOK_SECRET_TOKEN",
  "THIRDWEB_SECRET_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "WZRD_CLOUD_DAILY_CAP_USD",
  "WZRD_CLOUD_PROVIDER_KEYS",
  "ZAP_CONVEX_SERVICE_TOKEN",
  "ZAP_PROVIDER_WEBHOOK_SECRET",
  "ZAP_SECRET_REVEAL_TOKEN",
] as const;

export type SpriteDeployment = {
  deploymentId: string;
  deploymentUrl: string;
  projectId: string;
  projectName: string;
  status: "deploying" | "ready" | "error";
};

export async function deploySpriteToVercel(input: {
  authorId: string;
  composio: SpriteComposioSession | null;
  existing?: SpriteRecord | null;
  manifest: string;
  spec: SpriteSpec;
}): Promise<SpriteDeployment> {
  const config = deploymentConfig();
  const vercel = new Vercel({ bearerToken: config.token });
  const projectName = input.existing?.projectName ?? spriteProjectName(input.authorId);
  const variables = spriteEnvironment(input);
  let projectId = input.existing?.projectId;

  if (!projectId) {
    const project = await vercel.projects.createProject({
      teamId: config.teamId,
      requestBody: {
        environmentVariables: variables,
        framework: "eve",
        gitRepository: { repo: config.repo, type: "github" },
        name: projectName,
        rootDirectory: config.rootDirectory,
      },
    });
    projectId = project.id;
  } else {
    await vercel.projects.createProjectEnv({
      idOrName: projectId,
      teamId: config.teamId,
      upsert: "true",
      requestBody: variables.map((variable) => ({
        ...variable,
        customEnvironmentIds: [],
        target: ["production", "preview"],
      })),
    });
  }

  const deployment = await vercel.deployments.createDeployment({
    forceNew: "1",
    teamId: config.teamId,
    requestBody: {
      gitSource: { ref: config.ref, repoId: config.repoId, type: "github" },
      meta: { sprite: input.spec.sprite },
      name: projectName,
      project: projectId,
      target: "production",
    },
  });
  return {
    deploymentId: deployment.id,
    deploymentUrl: `https://${deployment.url}`,
    projectId,
    projectName,
    status: mapDeploymentStatus(deployment.readyState),
  };
}

export async function getSpriteVercelDeployment(deploymentId: string) {
  const config = deploymentConfig();
  const deployment = await new Vercel({ bearerToken: config.token }).deployments.getDeployment({
    idOrUrl: deploymentId,
    teamId: config.teamId,
  });
  return {
    deploymentError: deployment.errorMessage ?? undefined,
    deploymentUrl: deployment.url ? `https://${deployment.url}` : undefined,
    status: mapDeploymentStatus(deployment.readyState),
  };
}

function spriteEnvironment(input: {
  authorId: string;
  composio: SpriteComposioSession | null;
  manifest: string;
  spec: SpriteSpec;
}) {
  const sandbox = resolveSpriteSandboxPreset(input.spec.sandbox);
  const explicit = {
    COMPOSIO_MCP_HEADERS: input.composio ? JSON.stringify(input.composio.mcpHeaders) : undefined,
    COMPOSIO_MCP_URL: input.composio?.mcpUrl,
    SPRITE_CHANNELS: JSON.stringify(input.spec.channels),
    SPRITE_CONNECTIONS: JSON.stringify(input.spec.connections),
    SPRITE_MANIFEST_BASE64: Buffer.from(input.manifest).toString("base64"),
    SPRITE_OWNER_PRINCIPAL: input.authorId,
    ZAP_LLM_MODEL: input.spec.model.id,
    ZAP_LLM_ROUTE: input.spec.model.route,
    ZAP_SANDBOX_BACKEND: sandbox.backend,
  };
  const values = new Map<string, string>();
  for (const key of inheritedEnvKeys) {
    const value = process.env[key];
    if (value) values.set(key, value);
  }
  for (const [key, value] of Object.entries(explicit)) {
    if (value) values.set(key, value);
  }
  return [...values].map(([key, value]) => ({
    key,
    target: ["production", "preview"] as Array<"production" | "preview">,
    type: "sensitive" as const,
    value,
  }));
}

function deploymentConfig() {
  const token = process.env.SPRITE_VERCEL_TOKEN ?? process.env.VERCEL_TOKEN;
  const teamId = process.env.SPRITE_VERCEL_TEAM_ID;
  const repo = process.env.SPRITE_VERCEL_GIT_REPO;
  const repoId = process.env.SPRITE_VERCEL_GIT_REPO_ID;
  if (!token || !teamId || !repo || !repoId) {
    throw new Error("SPRITE_VERCEL_TOKEN, SPRITE_VERCEL_TEAM_ID, SPRITE_VERCEL_GIT_REPO, and SPRITE_VERCEL_GIT_REPO_ID are required.");
  }
  return {
    ref: process.env.SPRITE_VERCEL_GIT_REF ?? "main",
    repo,
    repoId,
    rootDirectory: process.env.SPRITE_VERCEL_ROOT_DIRECTORY ?? null,
    teamId,
    token,
  };
}

function spriteProjectName(authorId: string) {
  const suffix = createHash("sha256").update(authorId).digest("hex").slice(0, 12);
  return `zap-sprite-${suffix}`;
}

function mapDeploymentStatus(value: string | null | undefined): SpriteDeployment["status"] {
  if (value === "READY") return "ready";
  if (value === "ERROR" || value === "CANCELED" || value === "BLOCKED") return "error";
  return "deploying";
}
