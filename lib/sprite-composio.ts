import "server-only";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { SpriteSpec } from "@wzrdtech/core";

export type SpriteComposioSession = {
  mcpHeaders: Record<string, string>;
  mcpUrl: string;
  sessionId: string;
  toolkits: string[];
};

export async function createSpriteComposioSession(spec: SpriteSpec, userId: string): Promise<SpriteComposioSession | null> {
  const toolkits = unique([...spec.connectors, ...spec.social]);
  if (toolkits.length === 0) return null;
  const composio = getComposio();
  await Promise.all(toolkits.map((toolkit) => composio.toolkits.get(toolkit)));
  const session = await composio.sessions.create(userId, {
    manageConnections: false,
    mcp: true,
    toolkits,
  });
  return {
    mcpHeaders: { ...session.mcp.headers },
    mcpUrl: session.mcp.url,
    sessionId: session.sessionId,
    toolkits,
  };
}

export async function authorizeSpriteToolkit(input: {
  callbackUrl: string;
  sessionId: string;
  toolkit: string;
}) {
  const composio = getComposio();
  await composio.toolkits.get(input.toolkit);
  const session = await composio.sessions.use(input.sessionId, { mcp: true });
  const request = await session.authorize(input.toolkit, { callbackUrl: input.callbackUrl });
  return { redirectUrl: request.redirectUrl };
}

function getComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for Sprite connectors.");
  return new Composio({
    allowTracking: false,
    apiKey,
    provider: new VercelProvider(),
  });
}

function unique(values: string[]) {
  return [...new Set(values)];
}
