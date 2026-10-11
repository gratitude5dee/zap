import manifest from "../packages/cli/package.json";

/**
 * Single source of truth for the published @wzrdtech/zap version shown on
 * every surface. Imported as a JSON module so the bundler inlines it — no
 * filesystem read at runtime (Workers have none).
 */
export const ZAP_VERSION: string = (manifest as { version: string }).version;
