import { access } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve(process.argv[2] ?? ".output/server");
const requiredPackages = [
  "@asciidev/eve-box",
  "@daytonaio/sdk",
  "e2b",
];

const missing = [];
for (const packageName of requiredPackages) {
  try {
    await access(resolve(outputRoot, "node_modules", packageName, "package.json"));
  } catch {
    missing.push(packageName);
  }
}

if (missing.length > 0) {
  throw new Error(
    `Eve runtime output ${outputRoot} is missing traced sandbox dependencies: ${missing.join(", ")}`,
  );
}

console.log(`Verified ${requiredPackages.length} sandbox runtime dependencies in ${outputRoot}.`);
