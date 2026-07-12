import { createThirdwebClient } from "thirdweb";
import { createAuth, signLoginPayload } from "thirdweb/auth";
import { privateKeyToAccount } from "thirdweb/wallets";

if (process.env.ALLOW_LIVE_ACCEPTANCE !== "1") {
  throw new Error("Set ALLOW_LIVE_ACCEPTANCE=1 to run production wallet acceptance.");
}

const origin = (process.env.ZAP_ACCEPTANCE_ORIGIN ?? "https://zap.wzrd.tech").replace(/\/$/, "");
const clientId = requiredEnv("NEXT_PUBLIC_THIRDWEB_CLIENT_ID");
const privateKey = requiredEnv("ZAP_ACCEPTANCE_PRIVATE_KEY");
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  throw new Error("ZAP_ACCEPTANCE_PRIVATE_KEY must be a 32-byte hex test key.");
}

const client = createThirdwebClient({ clientId });
const account = privateKeyToAccount({ client, privateKey });
const slug = process.env.ZAP_ACCEPTANCE_SLUG
  ?? `release-acceptance-${account.address.slice(-8).toLowerCase()}`;

const loginPayload = await expectJson(
  await fetch(`${origin}/api/auth/wallet-proof/payload`, {
    body: JSON.stringify({ address: account.address, chainId: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }),
  200,
  "wallet payload",
);
const proof = await signLoginPayload({ account, payload: loginPayload });
const localAuth = createAuth({
  client,
  domain: new URL(origin).host,
  login: {
    payloadExpirationTimeSeconds: 600,
    statement: "Sign in to Zap Studio and authorize your wallet principal.",
    uri: origin,
    version: "1",
  },
});
const localVerification = await localAuth.verifyPayload(proof);
if (!localVerification.valid) {
  throw new Error(`Local thirdweb verification failed: ${localVerification.error}`);
}
const loginResponse = await fetch(`${origin}/api/auth/wallet-proof`, {
  body: JSON.stringify(proof),
  headers: { "content-type": "application/json" },
  method: "POST",
});
if (loginResponse.status !== 200) {
  const loginError = await readJson(loginResponse.clone());
  const edgeDiagnostic = await diagnoseSupabaseEdge(proof);
  throw new Error(
    `wallet login returned ${loginResponse.status}: ${errorMessage(loginError.error)}; ${edgeDiagnostic}`,
  );
}
const cookie = sessionCookie(loginResponse.headers.get("set-cookie"));

const authenticatedFetch = (pathname, init = {}) => fetch(`${origin}${pathname}`, {
  ...init,
  headers: {
    cookie,
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...init.headers,
  },
});

const session = await expectJson(
  await authenticatedFetch("/api/auth/session"),
  200,
  "wallet session",
);
if (session.principal?.walletAddress?.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error("Supabase session principal does not match the signing wallet.");
}

const zapMd = `---
zap: ${slug}
version: 2
description: Production acceptance Zap stored privately for the release test wallet.
inputs:
  PROMPT:
    type: string
    required: true
    label: Prompt
defaults:
  provider: fal
  models:
    image.gen: fal-ai/flux/dev
budget:
  estimate_usd: 0.025
  cap_usd: 1
steps:
  - id: hero
    kind: image.gen
    provider: fal
    model: fal-ai/flux/dev
    prompt: "Create a release acceptance image for {PROMPT}"
output: Zap.png
---

# Release Acceptance
`;

const validation = await expectJson(
  await authenticatedFetch("/api/studio/validate", {
    body: JSON.stringify({ prompts: {}, zapMd }),
    method: "POST",
  }),
  200,
  "Studio validation",
);
const publication = await expectJson(
  await authenticatedFetch("/api/zaps/publish", {
    body: JSON.stringify({ prompts: {}, status: "published", zapMd }),
    method: "POST",
  }),
  200,
  "private Zap publication",
);
if (publication.visibility !== "private") {
  throw new Error("Wallet-authored acceptance Zap must remain private.");
}

const catalog = await expectJson(
  await authenticatedFetch("/api/studio/zaps"),
  200,
  "Studio catalog",
);
if (!catalog.zaps?.some((zap) => zap.slug === slug && zap.visibility === "private")) {
  throw new Error("Published acceptance Zap is missing from the wallet catalog.");
}

const privateZapPage = await authenticatedFetch(`/${encodeURIComponent(slug)}`);
if (privateZapPage.status !== 200) {
  throw new Error(`Private Zap page returned ${privateZapPage.status}.`);
}

const fork = await expectJson(
  await authenticatedFetch("/api/studio/fork", {
    body: JSON.stringify({ slug: "world-cup-entrance" }),
    method: "POST",
  }),
  200,
  "template fork",
);

const spriteMd = `---
sprite: ${slug}
version: 1
description: Production acceptance Sprite stored privately for the release test wallet.
zaps: [world-cup-entrance]
sandbox: box-standard
model:
  route: gateway
  id: anthropic/claude-sonnet-4.6
connections: []
connectors: []
social: []
channels: [slack]
---

# Release Acceptance Sprite
`;
const sprite = await expectJson(
  await authenticatedFetch("/api/studio/sprite", {
    body: JSON.stringify({ spriteMd }),
    method: "POST",
  }),
  200,
  "Sprite draft",
);
const secrets = await expectJson(
  await authenticatedFetch("/api/secrets"),
  200,
  "Supabase secret inventory",
);
const hostedRunResponse = await authenticatedFetch("/api/zaps/run", {
  body: JSON.stringify({
    credentialMode: "wzrd-cloud",
    inputs: { PROMPT: "production acceptance" },
    live: true,
    slug,
  }),
  method: "POST",
});
const hostedRun = await readJson(hostedRunResponse);
if (hostedRunResponse.status !== 200) {
  throw new Error(`hosted run returned ${hostedRunResponse.status}: ${errorMessage(hostedRun.error)}`);
}
if (typeof hostedRun.runId !== "string" || !hostedRun.runId.startsWith("run_")) {
  throw new Error("Hosted run did not return a valid run id.");
}
const completedRun = await waitForHostedRun(hostedRun.runId);
if (completedRun.run.status !== "done") {
  throw new Error(`Hosted run ${hostedRun.runId} finished as ${completedRun.run.status}: ${errorMessage(completedRun.run.error)}`);
}
if (!completedRun.assets?.length) {
  throw new Error(`Hosted run ${hostedRun.runId} completed without a persisted asset.`);
}

console.log(JSON.stringify({
  catalogCount: catalog.zaps.length,
  forkSlug: fork.slug,
  hostedRun: {
    assetCount: completedRun.assets.length,
    costUsd: completedRun.run.costUsd,
    httpStatus: hostedRunResponse.status,
    runId: hostedRun.runId,
    status: completedRun.run.status,
    zapUrl: completedRun.run.zapUrl,
  },
  principalId: session.principal.principalId,
  secretTypesConfigured: secrets.secrets?.map((secret) => secret.secretType) ?? [],
  spriteStatus: sprite.status,
  validation,
  zap: {
    pageStatus: privateZapPage.status,
    slug: publication.slug,
    visibility: publication.visibility,
  },
}, null, 2));

async function waitForHostedRun(runId) {
  const timeoutMs = Number(process.env.ZAP_ACCEPTANCE_RUN_TIMEOUT_MS ?? 10 * 60 * 1000);
  const pollMs = Number(process.env.ZAP_ACCEPTANCE_RUN_POLL_MS ?? 5_000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await expectJson(
      await authenticatedFetch("/api/studio/runs"),
      200,
      "Studio run status",
    );
    const entry = result.runs?.find((candidate) => candidate.run?.runId === runId);
    if (entry && ["canceled", "done", "failed", "waiting"].includes(entry.run.status)) return entry;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Hosted run ${runId} did not reach a terminal state within ${timeoutMs}ms.`);
}

async function expectJson(response, expectedStatus, label) {
  const payload = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${label} returned ${response.status}: ${errorMessage(payload.error)}`);
  }
  return payload;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || response.statusText };
  }
}

function errorMessage(error) {
  if (typeof error === "string") return error;
  if (error && typeof error.message === "string") return error.message;
  return error ? JSON.stringify(error) : "";
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sessionCookie(setCookie) {
  const match = setCookie?.match(/(?:^|,\s*)zap_supabase_token=([^;]+)/);
  if (!match) throw new Error("Wallet login did not return the HttpOnly Supabase session cookie.");
  return `zap_supabase_token=${match[1]}`;
}

async function diagnoseSupabaseEdge(proof) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !apiKey) return "Supabase direct diagnostic unavailable";
  const functionName = process.env.ZAP_WALLET_PROOF_FUNCTION ?? "zap-wallet-proof";
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    body: JSON.stringify(proof),
    headers: { apikey: apiKey, "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);
  if (response.status !== 401) {
    return `Supabase Edge returned ${response.status}: ${errorMessage(payload.error)}`;
  }
  const bearerResponse = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    body: JSON.stringify(proof),
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const bearerPayload = await readJson(bearerResponse);
  const diagnostics = [
    `Supabase Edge apikey-only returned ${response.status}: ${errorMessage(payload.error)}`,
    `apikey+bearer returned ${bearerResponse.status}: ${errorMessage(bearerPayload.error)}`,
  ];
  const legacyAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (legacyAnonKey && legacyAnonKey !== apiKey) {
    const legacyResponse = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
      body: JSON.stringify(proof),
      headers: {
        apikey: legacyAnonKey,
        authorization: `Bearer ${legacyAnonKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const legacyPayload = await readJson(legacyResponse);
    diagnostics.push(
      `legacy anon bearer returned ${legacyResponse.status}: ${errorMessage(legacyPayload.error)}`,
    );
  }
  return diagnostics.join("; ");
}
