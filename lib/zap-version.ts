import { readFileSync } from "node:fs";
import path from "node:path";

type PackageManifest = { readonly version: string };

/** Single source of truth for the published @wzrdtech/zap version shown on every surface. */
export const ZAP_VERSION: string = (
  JSON.parse(
    readFileSync(path.join(process.cwd(), "packages", "cli", "package.json"), "utf8"),
  ) as PackageManifest
).version;
