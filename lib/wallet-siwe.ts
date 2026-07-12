export const ZAP_LOGIN_STATEMENT = "Sign in to Zap Studio and authorize your wallet principal.";

export type WalletLoginPayload = {
  address: string;
  chain_id?: string;
  domain: string;
  expiration_time: string;
  invalid_before: string;
  issued_at: string;
  nonce: string;
  resources?: string[];
  statement: string;
  uri?: string;
  version: string;
};

export function createWalletLoginMessage(payload: WalletLoginPayload) {
  const header = `${payload.domain} wants you to sign in with your Ethereum account:`;
  let prefix = `${header}\n${payload.address}\n\n${payload.statement}`;
  if (payload.statement) prefix += "\n";
  const suffix = [
    ...(payload.uri ? [`URI: ${payload.uri}`] : []),
    `Version: ${payload.version}`,
    ...(payload.chain_id ? [`Chain ID: ${payload.chain_id}`] : []),
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.issued_at}`,
    `Expiration Time: ${payload.expiration_time}`,
    ...(payload.invalid_before ? [`Not Before: ${payload.invalid_before}`] : []),
    ...(payload.resources?.length ? [["Resources:", ...payload.resources.map((resource) => `- ${resource}`)].join("\n")] : []),
  ].join("\n");
  return `${prefix}\n${suffix}`;
}

export function validateWalletLoginPayload(
  payload: WalletLoginPayload,
  options: { domain: string; now?: Date; statement?: string; uri: string },
) {
  if (payload.domain !== options.domain) throw new Error("Wallet login domain does not match this deployment.");
  if (payload.uri !== options.uri) throw new Error("Wallet login URI does not match this deployment.");
  if (payload.statement !== (options.statement ?? ZAP_LOGIN_STATEMENT)) throw new Error("Wallet login statement is invalid.");
  if (payload.version !== "1") throw new Error("Wallet login version must be 1.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(payload.address)) throw new Error("Wallet login address is invalid.");
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(payload.nonce)) throw new Error("Wallet login nonce is invalid.");
  if (payload.chain_id && !/^\d+$/.test(payload.chain_id)) throw new Error("Wallet login chain id is invalid.");

  const now = (options.now ?? new Date()).getTime();
  const issuedAt = parseDate(payload.issued_at, "issued at");
  const invalidBefore = parseDate(payload.invalid_before, "not before");
  const expiresAt = parseDate(payload.expiration_time, "expiration time");
  if (issuedAt > now + 5 * 60_000) throw new Error("Wallet login was issued in the future.");
  if (invalidBefore > now) throw new Error("Wallet login is not active yet.");
  if (expiresAt <= now) throw new Error("Wallet login has expired.");
  if (expiresAt - issuedAt > 15 * 60_000) throw new Error("Wallet login validity window is too long.");
  return payload;
}

function parseDate(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Wallet login ${label} is invalid.`);
  return parsed;
}
