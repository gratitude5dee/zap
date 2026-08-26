#!/usr/bin/env node
// Create a Namespace instance for a Zap runtime (operator flow).
//
//   NAMESPACE_TOKEN=… node --experimental-strip-types infra/namespace/create-instance.ts \
//     --region us --image <zap-heavy image ref> --tenant t1 --runtime r1
//
// Linux instances run the zap-heavy image built by Dockerfile.zap-heavy;
// macOS instances are native and bootstrap from
// packages/templates/env-macos/bootstrap.sh. Ingress: 8722 published with
// Namespace auth ON (the bridge additionally checks X-Zap-Bridge-Token);
// harness ports are published open with service-level auth.
import { randomUUID } from "node:crypto";

const COMPUTE_API = process.env.NAMESPACE_COMPUTE_API ?? "https://compute.namespaceapis.com";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

async function main(): Promise<void> {
  const token = process.env.NAMESPACE_TOKEN;
  if (!token?.trim()) throw new Error("NAMESPACE_TOKEN required");
  const region = arg("region", "us");
  const image = arg("image");
  const tenant = arg("tenant");
  const runtime = arg("runtime");
  const runtimeToken = process.env.RUNTIME_TOKEN ?? randomUUID();

  const res = await fetch(`${COMPUTE_API}/namespace.cloud.compute.v1beta.ComputeService/CreateInstance`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      region,
      shape: { virtual_cpu: 2, memory_megabytes: 4096 },
      containers: [{
        name: "zap-runtime",
        image_ref: image,
        env: [
          { name: "TENANT_ID", value: tenant },
          { name: "RUNTIME_ID", value: runtime },
          { name: "RUNTIME_TOKEN", value: runtimeToken },
        ],
        export_ports: [{ port: 8722, ingress: { authenticated: true } }],
      }],
    }),
  });
  if (!res.ok) throw new Error(`CreateInstance failed: ${res.status} ${await res.text()}`);
  const body = await res.json() as { metadata?: { instance_id?: string } };
  // The runtime token is per-instance and never printed — read it from your
  // secret store; only the instance id is operator-visible output.
  console.log(JSON.stringify({ instanceId: body.metadata?.instance_id ?? null }, null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
