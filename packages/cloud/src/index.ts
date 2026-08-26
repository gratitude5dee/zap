/** Zap cloud control API. Skeleton at Z0; session F lands the Hono app in Z10. */
export interface RuntimeRow {
  id: string;
  tenantId: string;
  weight: "light" | "med" | "heavy";
  provider: string;
  state: "provisioning" | "ready" | "running" | "idle" | "stopped" | "error";
  createdAt: string;
}

export interface CloudApiInfo {
  name: "zap-cloud";
  version: string;
  routes: readonly string[];
}

export function cloudApiInfo(version: string): CloudApiInfo {
  return {
    name: "zap-cloud",
    version,
    routes: ["/v1/runtimes", "/v1/sessions", "/v1/pay", "/v1/meter", "/v1/templates"],
  };
}
