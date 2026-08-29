import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type ConnectivityFeature = "tailscale" | "cotal" | "taskrouter" | "samMesh" | "x402";
export type ConnectivityFeatureStatus = "installed" | "running" | "stopped" | "error";

/**
 * Non-secret projection of a runtime's connectivity state. There is no field
 * for a join credential, a control-plane URL, or message content — those never
 * leave the box.
 */
export type RuntimeConnectivityRecord = {
  authorId: string;
  cotalEnabled: boolean;
  cotalStatus?: ConnectivityFeatureStatus;
  runtimeId: string;
  samMeshEnabled: boolean;
  samMeshStatus?: ConnectivityFeatureStatus;
  statusAt?: number;
  tailscaleEnabled: boolean;
  tailscaleStatus?: ConnectivityFeatureStatus;
  taskrouterEnabled: boolean;
  taskrouterStatus?: ConnectivityFeatureStatus;
  updatedAt: number;
  x402Enabled: boolean;
};

const getByRuntime = makeFunctionReference<"query">("runtimeConnectivity:getByRuntime");
const listByAuthor = makeFunctionReference<"query">("runtimeConnectivity:listByAuthor");
const setOptIn = makeFunctionReference<"mutation">("runtimeConnectivity:setOptIn");
const recordStatus = makeFunctionReference<"mutation">("runtimeConnectivity:recordStatus");

export async function getRuntimeConnectivity(authorId: string, runtimeId: string) {
  return await client().query(getByRuntime, {
    authorId,
    runtimeId,
    serviceToken: serviceToken(),
  }) as RuntimeConnectivityRecord | null;
}

export async function listRuntimeConnectivity(authorId: string) {
  return await client().query(listByAuthor, {
    authorId,
    serviceToken: serviceToken(),
  }) as RuntimeConnectivityRecord[];
}

export async function setRuntimeConnectivityOptIn(input: {
  authorId: string;
  enabled: boolean;
  feature: ConnectivityFeature;
  runtimeId: string;
}) {
  return await client().mutation(setOptIn, { ...input, serviceToken: serviceToken() }) as string;
}

export async function recordRuntimeConnectivityStatus(input: {
  authorId: string;
  feature: Exclude<ConnectivityFeature, "x402">;
  runtimeId: string;
  status: ConnectivityFeatureStatus;
}) {
  await client().mutation(recordStatus, { ...input, serviceToken: serviceToken() });
}

function client() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required for connectivity state.");
  return new ConvexHttpClient(url);
}

function serviceToken() {
  const token = process.env.ZAP_CONVEX_SERVICE_TOKEN;
  if (!token) throw new Error("ZAP_CONVEX_SERVICE_TOKEN is required for server-owned Convex writes.");
  return token;
}
