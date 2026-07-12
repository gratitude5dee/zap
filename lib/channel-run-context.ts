import type { ZapCredentialMode } from "./zap-run-auth";

type SessionPrincipal = {
  attributes: Readonly<Record<string, string | readonly string[]>>;
  authenticator: string;
  principalId: string;
};

export type ChannelAwareRunContext = {
  credentialMode: ZapCredentialMode;
  principalId?: string;
  userId?: string;
};

export function resolveChannelAwareRunContext(input: {
  auth?: SessionPrincipal | null;
  credentialMode?: ZapCredentialMode;
  live: boolean;
}): ChannelAwareRunContext {
  const auth = input.auth;
  const channelAuth = auth?.authenticator === "channel-link" || auth?.authenticator === "channel-unlinked";
  if (channelAuth && input.live && auth?.authenticator !== "channel-link") {
    throw new Error("Live runs from chat require a linked wallet. Generate a link code in Zap Settings, then send /link CODE here.");
  }

  const credentialMode = input.credentialMode
    ?? (auth?.authenticator === "channel-link" && input.live ? "wzrd-cloud" : "byok");
  const walletPrincipal = auth?.principalId.startsWith("wallet:0x") ? auth.principalId : undefined;
  if (credentialMode === "wzrd-cloud" && input.live && !walletPrincipal) {
    throw new Error("WZRD Cloud runs require a verified wallet principal.");
  }

  const walletUserId = stringAttribute(auth?.attributes.walletUserId);
  return {
    credentialMode,
    principalId: walletPrincipal,
    userId: walletUserId,
  };
}

function stringAttribute(value: string | readonly string[] | undefined) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
