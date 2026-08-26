import { createCloudApp, type CreateCloudAppOptions } from "../app.ts";
import type { CloudDeps, CloudHono } from "../types.ts";
import { sweepRuntimes } from "../sweep.ts";

export interface CloudflareAdapterOptions extends CreateCloudAppOptions {
  deps: CloudDeps;
}

/**
 * Cloudflare adapter (`ZAP_CLOUD_ADAPTER=cloudflare`): the same Hono app on
 * Workers. Production deployments inject D1/R2-backed stores via
 * {@link CloudDeps}; the sweeper runs from a cron trigger instead of a
 * Vercel cron hit on /v1/sweep.
 */
export function createCloudflareCloud(options: CloudflareAdapterOptions): CloudHono {
  return createCloudApp(options.deps, { modules: options.modules });
}

/** Workers export shape: `{ fetch, scheduled }`. */
export function cloudflareWorker(options: CloudflareAdapterOptions): {
  fetch: (req: Request) => Promise<Response>;
  scheduled: () => Promise<void>;
} {
  const app = createCloudflareCloud(options);
  return {
    fetch: (req: Request) => Promise.resolve(app.fetch(req)),
    scheduled: async () => {
      await sweepRuntimes(options.deps, (options.deps.now ?? (() => new Date()))());
    },
  };
}
