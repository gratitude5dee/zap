// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMessage } from "https://esm.sh/ethers@6.15.0";

const corsHeaders = {
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": Deno.env.get("ZAP_PUBLIC_ORIGIN") ?? "https://zap.wzrd.tech",
};

const loginStatement = "Sign in to Zap Studio and authorize your wallet principal.";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json();
    const proof = normalizeProof(body);
    verifyWalletProof(proof);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const admin = createClient(supabaseUrl, supabaseSecretKey());
    const password = await walletPassword(proof.address);
    const user = await getOrCreateWalletUser(admin, proof.address, password);
    await recordNonce(admin, proof.address, proof.nonce);

    const session = await createWalletSession(supabaseUrl, proof.address, password);
    const expiresIn = Number(session.expires_in ?? Deno.env.get("ZAP_WALLET_TOKEN_TTL_SECONDS") ?? 60 * 60 * 24 * 7);

    return json({
      access_token: session.access_token,
      expires_in: expiresIn,
      refresh_token: session.refresh_token,
      token_type: "bearer",
      user: {
        id: user.id,
        wallet_address: proof.address,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Wallet proof failed." }, 400);
  }
});

function normalizeProof(body: Record<string, unknown>) {
  if (typeof body.payload !== "object" || !body.payload) throw new Error("Thirdweb SIWE payload is required.");
  const payload = body.payload as Record<string, unknown>;
  const signedAddress = String(payload.address ?? "");
  const address = normalizeAddress(signedAddress);
  const signature = String(body.signature ?? "");
  const normalized = {
    address,
    chain_id: optionalString(payload.chain_id),
    domain: String(payload.domain ?? ""),
    expiration_time: String(payload.expiration_time ?? ""),
    invalid_before: String(payload.invalid_before ?? ""),
    issued_at: String(payload.issued_at ?? ""),
    nonce: String(payload.nonce ?? ""),
    resources: Array.isArray(payload.resources) ? payload.resources.map(String) : undefined,
    signedAddress,
    statement: String(payload.statement ?? ""),
    uri: String(payload.uri ?? ""),
    version: String(payload.version ?? ""),
  };

  if (!normalized.address) throw new Error("Wallet address is required.");
  if (!signature) throw new Error("Wallet signature is required.");
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(normalized.nonce)) throw new Error("Wallet proof nonce is invalid.");

  return { ...normalized, signature };
}

function verifyWalletProof(proof: ReturnType<typeof normalizeProof>) {
  const expectedOrigin = (Deno.env.get("ZAP_PUBLIC_ORIGIN") ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  const expectedDomain = Deno.env.get("ZAP_AUTH_DOMAIN") ?? new URL(expectedOrigin).host;
  if (proof.domain !== expectedDomain) throw new Error("Wallet proof domain does not match this deployment.");
  if (proof.uri !== expectedOrigin) throw new Error("Wallet proof URI does not match this deployment.");
  if (proof.statement !== loginStatement) throw new Error("Wallet proof statement is invalid.");
  if (proof.version !== "1") throw new Error("Wallet proof version must be 1.");
  if (proof.chain_id && !/^\d+$/.test(proof.chain_id)) throw new Error("Wallet proof chain id is invalid.");

  const message = createLoginMessage(proof);
  const recovered = normalizeAddress(verifyMessage(message, proof.signature));
  if (recovered !== proof.address) throw new Error("Wallet signature does not match address.");

  const now = Date.now();
  const issuedAtMs = parseDate(proof.issued_at, "issued at");
  const invalidBeforeMs = parseDate(proof.invalid_before, "not before");
  const expiresAtMs = parseDate(proof.expiration_time, "expiration time");
  if (issuedAtMs > now + 1000 * 60 * 5) throw new Error("Wallet proof issued at is in the future.");
  if (invalidBeforeMs > now) throw new Error("Wallet proof is not active yet.");
  if (expiresAtMs <= now) throw new Error("Wallet proof has expired.");
  if (expiresAtMs - issuedAtMs > 1000 * 60 * 15) throw new Error("Wallet proof validity window is too long.");
}

async function getOrCreateWalletUser(admin, address: string, password: string) {
  const { data: existing, error: existingError } = await admin
    .from("wallet_auth_users")
    .select("user_id")
    .eq("address", address)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.user_id) {
    const { data, error } = await admin.auth.admin.getUserById(existing.user_id);
    if (error) throw error;
    if (data?.user) return await updateWalletUser(admin, data.user, address, password);
  }

  const email = walletEmail(address);
  const created = await createWalletUser(admin, address, email, password);
  const { error: linkError } = await admin
    .from("wallet_auth_users")
    .upsert({ address, user_id: created.id }, { onConflict: "address" });
  if (linkError) throw linkError;
  return created;
}

async function createWalletUser(admin, address: string, email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      provider: "thirdweb",
      wallet_address: address,
    },
    app_metadata: {
      provider: "thirdweb",
      wallet_address: address,
    },
  });
  if (!error && data?.user) return data.user;

  if (!String(error?.message ?? "").toLowerCase().includes("already")) throw error;

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const found = listed.users.find((user) => user.email?.toLowerCase() === email);
  if (!found) throw error;
  return await updateWalletUser(admin, found, address, password);
}

async function updateWalletUser(admin, user, address: string, password: string) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
    password,
    user_metadata: {
      ...user.user_metadata,
      provider: "thirdweb",
      wallet_address: address,
    },
    app_metadata: {
      ...user.app_metadata,
      provider: "thirdweb",
      wallet_address: address,
    },
  });
  if (error) throw error;
  return data?.user ?? user;
}

async function recordNonce(admin, address: string, nonce: string) {
  const { error } = await admin
    .from("wallet_auth_nonces")
    .insert({ address, nonce });
  if (error) {
    if (String(error.code) === "23505") throw new Error("Wallet proof nonce was already used.");
    throw error;
  }
}

async function createWalletSession(supabaseUrl: string, address: string, password: string) {
  const client = createClient(supabaseUrl, supabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: walletEmail(address),
    password,
  });
  if (error || !data.session?.access_token) throw new Error(error?.message ?? "Could not create Supabase wallet session.");
  return data.session;
}

async function walletPassword(address: string) {
  const secret = requiredEnv("ZAP_WALLET_AUTH_SECRET");
  const material = new TextEncoder().encode(`${secret}:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return `zap_${encodeBase64Url(new Uint8Array(digest))}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createLoginMessage(payload: ReturnType<typeof normalizeProof>) {
  const header = `${payload.domain} wants you to sign in with your Ethereum account:`;
  let prefix = `${header}\n${payload.signedAddress}\n\n${payload.statement}`;
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

function parseDate(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Wallet proof ${label} is invalid.`);
  return parsed;
}

function optionalString(value: unknown) {
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function normalizeAddress(address: string) {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return "";
  return normalized;
}

function walletEmail(address: string) {
  return `${address.slice(2)}@wallet.zap.local`;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function supabaseSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const encoded = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!encoded) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS is required.");
  const keys = JSON.parse(encoded);
  const key = keys.default ?? Object.values(keys)[0];
  if (!key || typeof key !== "string") throw new Error("SUPABASE_SECRET_KEYS must include a secret key.");
  return key;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });
}
