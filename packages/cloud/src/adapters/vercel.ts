import { createCloudApp, type CreateCloudAppOptions } from "../app.ts";
import type { CloudDeps, CloudHono } from "../types.ts";

export interface VercelAdapterOptions extends CreateCloudAppOptions {
  deps: CloudDeps;
}

/**
 * Vercel adapter (the shipped default, `ZAP_CLOUD_ADAPTER=vercel`): the same
 * Hono app served from a Vercel function. Production deployments inject
 * Convex/Upstash/Blob-backed stores via {@link CloudDeps}; the app itself is
 * identical across adapters.
 */
export function createVercelCloud(options: VercelAdapterOptions): CloudHono {
  return createCloudApp(options.deps, { modules: options.modules });
}

/** `app/api/cloud` entrypoint: expose the Hono fetch handler to Vercel. */
export function vercelFetchHandler(options: VercelAdapterOptions): (req: Request) => Promise<Response> {
  const app = createVercelCloud(options);
  return (req: Request) => Promise.resolve(app.fetch(req));
}
