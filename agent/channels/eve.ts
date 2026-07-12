import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, vercelOidc } from "eve/channels/auth";

const agentTokenAuth: AuthFn<Request> = async (request) => {
  const expected = process.env.ZAP_AGENT_TOKEN;
  if (!expected) return null;
  const header = request.headers.get("authorization");
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice("bearer ".length).trim() : "";
  if (token !== expected && request.headers.get("x-zap-agent-token") !== expected) return null;
  return {
    attributes: { providerId: "zap-agent-token" },
    authenticator: "zap-agent-token",
    principalId: "zap-agent",
    principalType: "app",
  };
};

const supabaseSessionAuth: AuthFn<Request> = async (request) => {
  const token = bearerToken(request) || readCookie(request.headers.get("cookie"), "zap_supabase_token");
  if (!token) return null;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !url) return null;
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json() as {
    app_metadata?: { provider?: unknown; wallet_address?: unknown };
    email?: string;
    id?: string;
  };
  const walletAddress = typeof user.app_metadata?.wallet_address === "string"
    ? user.app_metadata.wallet_address.toLowerCase()
    : "";
  if (!user.id || user.app_metadata?.provider !== "thirdweb" || !/^0x[a-f0-9]{40}$/.test(walletAddress)) return null;
  const attributes: Record<string, string> = { providerId: "supabase", walletUserId: user.id };
  if (user.email) attributes.email = user.email;
  return {
    attributes,
    authenticator: "supabase",
    principalId: `wallet:${walletAddress}`,
    principalType: "user",
  };
};

export default eveChannel({
  auth: [agentTokenAuth, supabaseSessionAuth, vercelOidc(), localDev()],
});

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.toLowerCase().startsWith("bearer ") ? header.slice("bearer ".length).trim() : "";
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  const prefix = `${name}=`;
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}
