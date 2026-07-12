// @ts-nocheck

const providerSecretEnv = {
  box: {
    box_api_key: ["BOX_API_KEY"],
  },
  daytona: {
    daytona_api_key: ["DAYTONA_API_KEY"],
  },
  aws: {
    aws_access_key_id: ["AWS_ACCESS_KEY_ID"],
    aws_region: ["AWS_REGION"],
    aws_role_arn: ["AWS_ROLE_ARN"],
    aws_s3_output_uri: ["AWS_S3_OUTPUT_URI"],
    aws_secret_access_key: ["AWS_SECRET_ACCESS_KEY"],
    aws_session_token: ["AWS_SESSION_TOKEN"],
  },
  fal: {
    fal_key: ["FAL_KEY"],
  },
  gmi: {
    gmi_api_key: ["GMI_API_KEY", "GMI_CLOUD_API_KEY"],
    gmi_org_id: ["GMI_ORG_ID"],
  },
  prodia: {
    prodia_token: ["PRODIA_TOKEN"],
  },
  runware: {
    runware_key: ["RUNWARE_KEY"],
  },
  vertex: {
    vertex_api_key: ["VERTEX_API_KEY"],
    vertex_location: ["VERTEX_LOCATION"],
    vertex_output_gcs_uri: ["VERTEX_OUTPUT_GCS_URI"],
    vertex_project: ["VERTEX_PROJECT"],
    vertex_service_account: ["VERTEX_SERVICE_ACCOUNT"],
  },
} as const;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const expected = Deno.env.get("ZAP_SECRET_REVEAL_TOKEN") ?? "";
  const received = request.headers.get("x-zap-server-secret") ?? "";
  if (!expected || !(await constantTimeEqual(expected, received))) {
    return json({ error: "Server reveal token required." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider ?? "");
  const mapping = providerSecretEnv[provider as keyof typeof providerSecretEnv];
  if (!mapping) return json({ error: "Unsupported managed provider." }, 400);

  const secrets: Record<string, string> = {};
  for (const [secretType, envNames] of Object.entries(mapping)) {
    const value = envNames.map((name) => Deno.env.get(name)?.trim()).find(Boolean);
    if (value) secrets[secretType] = value;
  }
  if (Object.keys(secrets).length === 0) {
    return json({ error: `Managed credentials are not configured for provider ${provider}.` }, 404);
  }

  return json({ secrets });
});

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    status,
  });
}
