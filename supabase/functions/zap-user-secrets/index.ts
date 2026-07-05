// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const secretTypes = new Set([
  "gmi_api_key",
  "gmi_org_id",
  "fal_key",
  "runware_key",
  "prodia_token",
  "openrouter_key",
  "ai_gateway_api_key",
]);

const corsHeaders = {
  "access-control-allow-headers": "authorization, apikey, content-type, x-zap-server-secret",
  "access-control-allow-methods": "DELETE, GET, OPTIONS, POST, PUT",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  try {
    const context = await getContext(request);
    if (request.method === "GET") return await listSecrets(context);
    if (request.method === "PUT") return await upsertSecret(request, context);
    if (request.method === "DELETE") return await deleteSecret(request, context);
    if (request.method === "POST") return await revealSecrets(request, context);
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Zap secrets request failed." }, 400);
  }
});

async function getContext(request: Request) {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = supabaseSecretKey();
  const serverRevealAllowed = request.headers.get("x-zap-server-secret") === Deno.env.get("ZAP_SECRET_REVEAL_TOKEN");
  if (serverRevealAllowed && request.method === "POST") {
    const body = await request.clone().json().catch(() => ({}));
    if (typeof body.userId === "string" && body.userId.length > 0) {
      return {
        admin: createClient(supabaseUrl, serviceRoleKey),
        revealAllowed: true,
        userId: body.userId,
      };
    }
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice("bearer ".length) : "";
  if (!token) throw new Error("Authorization bearer token required.");

  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid Supabase user token.");

  const admin = createClient(supabaseUrl, serviceRoleKey);
  return {
    admin,
    revealAllowed: serverRevealAllowed,
    userId: data.user.id,
  };
}

async function listSecrets(context: Awaited<ReturnType<typeof getContext>>) {
  const { data, error } = await context.admin
    .from("user_secrets")
    .select("secret_type,last4,provider,created_at,updated_at")
    .eq("user_id", context.userId)
    .not("secret_type", "is", null)
    .order("secret_type");
  if (error) throw error;
  return json({
    secrets: (data ?? []).map((secret) => ({
      createdAt: secret.created_at,
      last4: secret.last4,
      provider: secret.provider,
      secretType: secret.secret_type,
      updatedAt: secret.updated_at,
    })),
  });
}

async function upsertSecret(request: Request, context: Awaited<ReturnType<typeof getContext>>) {
  const body = await request.json();
  const secretType = assertSecretType(String(body.secretType ?? ""));
  const value = String(body.value ?? "");
  if (!value) throw new Error("Secret value is required.");
  const encrypted = await encrypt(value);
  const row = {
    ciphertext: encrypted.ciphertext,
    key_version: 1,
    last4: value.slice(-4),
    nonce: encrypted.nonce,
    provider: providerFromSecretType(secretType),
    secret_type: secretType,
    user_id: context.userId,
  };
  const { data, error } = await context.admin
    .from("user_secrets")
    .upsert(row, { onConflict: "user_id,secret_type" })
    .select("secret_type,last4,provider,created_at,updated_at")
    .single();
  if (error) throw error;
  return json({
    secret: {
      createdAt: data.created_at,
      last4: data.last4,
      provider: data.provider,
      secretType: data.secret_type,
      updatedAt: data.updated_at,
    },
  });
}

async function deleteSecret(request: Request, context: Awaited<ReturnType<typeof getContext>>) {
  const body = await request.json();
  const secretType = assertSecretType(String(body.secretType ?? ""));
  const { error } = await context.admin
    .from("user_secrets")
    .delete()
    .eq("user_id", context.userId)
    .eq("secret_type", secretType);
  if (error) throw error;
  return json({ ok: true });
}

async function revealSecrets(request: Request, context: Awaited<ReturnType<typeof getContext>>) {
  if (!context.revealAllowed) throw new Error("Server reveal token required.");
  const body = await request.json();
  const requested = Array.isArray(body.secretTypes) ? body.secretTypes.map((value: unknown) => assertSecretType(String(value))) : [];
  if (requested.length === 0) throw new Error("secretTypes are required.");
  const { data, error } = await context.admin
    .from("user_secrets")
    .select("secret_type,ciphertext,nonce")
    .eq("user_id", context.userId)
    .in("secret_type", requested);
  if (error) throw error;
  const secrets: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.secret_type && row.ciphertext && row.nonce) {
      secrets[row.secret_type] = await decrypt(row.ciphertext, row.nonce);
      await context.admin.from("secret_access_log").insert({
        accessed_at: new Date().toISOString(),
        reason: "provider_reveal",
        secret_type: row.secret_type,
        user_id: context.userId,
      });
    }
  }
  return json({ secrets });
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, await encryptionKey(), bytes);
  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    nonce: encodeBase64(iv),
  };
}

async function decrypt(ciphertext: string, nonce: string) {
  const decrypted = await crypto.subtle.decrypt(
    { iv: decodeBase64(nonce), name: "AES-GCM" },
    await encryptionKey(),
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptionKey() {
  const material = new TextEncoder().encode(requiredEnv("USER_SECRETS_ENCRYPTION_KEY"));
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt", "encrypt"]);
}

function assertSecretType(secretType: string) {
  if (!secretTypes.has(secretType)) throw new Error(`Unsupported secret type ${secretType}.`);
  return secretType;
}

function providerFromSecretType(secretType: string) {
  if (secretType.startsWith("gmi_")) return "gmi";
  if (secretType.startsWith("fal_")) return "fal";
  if (secretType.startsWith("prodia_")) return "prodia";
  if (secretType.startsWith("runware_")) return "runware";
  if (secretType.startsWith("openrouter_")) return "openrouter";
  if (secretType.startsWith("ai_gateway_")) return "ai_gateway";
  return secretType.replace(/_key$|_api_key$|_org_id$/g, "");
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

function encodeBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "access-control-allow-origin": allowedOrigin(), "content-type": "application/json" },
    status,
  });
}

function allowedOrigin() {
  const configured = Deno.env.get("ZAP_SECRETS_ALLOWED_ORIGIN");
  return configured && configured.length > 0 ? configured : "https://zap.wzrd.tech";
}
