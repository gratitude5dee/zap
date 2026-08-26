// The one Studio bridge (§4.12): wraps a deployed Zap agent (agents as code)
// as an Eve tool. Lives in the Eve package so @wzrdtech/zap-agent never
// depends on eve. Sessions open over /v1/sessions; plan-only by default and
// live turns require user approval (C5).
import { defineTool } from "eve/tools";
import { z } from "zod";

export interface ZapBridgeOptions {
  /** Control-plane base URL, e.g. https://api.zap.wzrd.tech */
  baseUrl?: string;
  /** Bearer token for the tenant (never logged, never echoed). */
  token?: string;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}

interface SessionEvent {
  type: string;
  text?: string;
  sessionId?: string;
  code?: string;
  remediation?: string;
  tool?: string;
  input?: unknown;
}

function parseRef(ref: string): { agent: string; alias: string } {
  const at = ref.indexOf("@");
  if (at === -1) return { agent: ref, alias: "production" };
  return { agent: ref.slice(0, at), alias: ref.slice(at + 1) || "production" };
}

async function readEvents(response: Response): Promise<SessionEvent[]> {
  const text = await response.text();
  const events: SessionEvent[] = [];
  for (const line of text.split("\n")) {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload) as SessionEvent);
    } catch {
      // non-JSON keepalive lines are ignored
    }
  }
  return events;
}

/**
 * Wraps a deployed agents-as-code agent (`"transcode@production"`) as an Eve
 * tool for the Studio agent. Each call opens (or resumes) a durable session
 * over `/v1/sessions` and sends one turn; live spend requires user approval.
 */
export function zapAgentTool(ref: string, options: ZapBridgeOptions = {}) {
  const { agent, alias } = parseRef(ref);
  const baseUrl = (options.baseUrl ?? "https://api.zap.wzrd.tech").replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init));
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  return defineTool({
    description: `Send one turn to the deployed Zap agent ${agent}@${alias}. Plan-only by default; live:true spends and requires approval.`,
    inputSchema: z.object({
      live: z.boolean().default(false),
      sessionId: z.string().optional(),
      text: z.string(),
    }),
    approval: ({ toolInput }) => {
      const input = toolInput as { live?: boolean } | undefined;
      return input?.live ? "user-approval" : "not-applicable";
    },
    async execute(input) {
      let sessionId = input.sessionId;
      if (!sessionId) {
        const created = await doFetch(`${baseUrl}/v1/sessions`, {
          body: JSON.stringify({ agent: `${agent}@${alias}` }),
          headers,
          method: "POST",
        });
        if (!created.ok) {
          throw new Error(`Opening a session for ${agent}@${alias} failed with status ${created.status}.`);
        }
        const body = (await created.json()) as { id: string };
        sessionId = body.id;
      }
      const turn = await doFetch(`${baseUrl}/v1/sessions/${sessionId}/turns`, {
        body: JSON.stringify({ live: input.live === true, text: input.text }),
        headers: { ...headers, accept: "text/event-stream" },
        method: "POST",
      });
      if (!turn.ok) {
        throw new Error(`Turn on session ${sessionId} failed with status ${turn.status}.`);
      }
      const events = await readEvents(turn);
      const failed = events.find((event) => event.type === "turn.failed");
      if (failed) {
        throw new Error(
          `Turn failed (${failed.code ?? "TURN_FAILED"}).${failed.remediation ? ` ${failed.remediation}` : ""}`,
        );
      }
      const completed = events.find((event) => event.type === "turn.completed");
      const planned = events
        .filter((event) => event.type === "tool.planned")
        .map((event) => event.tool)
        .filter((tool): tool is string => typeof tool === "string");
      return {
        planned,
        sessionId,
        text: completed?.text ?? "",
      };
    },
  });
}
