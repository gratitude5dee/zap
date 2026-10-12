import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rolldown's emitted `__require` is `createRequire(import.meta.url || "file:///")`.
 * On Cloudflare Workers that resolver cannot serve bare builtin specifiers
 * (`require("process")` → "No such module node:process"), while static
 * `import ... from "node:process"` works fine under nodejs_compat. Any CJS
 * module eagerly evaluated at startup (e.g. yaml) then fails worker
 * validation with error 10021.
 *
 * This patch rewrites .output/server/_runtime.mjs so `__require` serves bare
 * builtins from statically-imported `node:` modules, falling back to
 * createRequire for everything else. Idempotent; fails closed if the emitted
 * shape changes.
 */
const PATCH_ID = "zap-eve-cf-require-v1";
const BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "string_decoder",
  "tls",
  "tty",
  "url",
  "util",
  "zlib",
];

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(projectRoot, ".output", "server", "_runtime.mjs");

function fail(message) {
  console.error(`[${PATCH_ID}] ${message}`);
  process.exit(1);
}

const source = readFileSync(runtimePath, "utf8");
if (source.includes(PATCH_ID)) {
  console.log(`[${PATCH_ID}] already applied`);
  process.exit(0);
}

const requireDecl =
  "var __require = /* #__PURE__ */ (() => createRequire(import.meta.url || \"file:///\"))();";
if (!source.includes(requireDecl)) {
  fail(`expected __require declaration not found in ${runtimePath}`);
}

const importLines = BUILTINS.map(
  (name) => `import * as __ns_${name.replace(/-/g, "_")} from "node:${name}";`,
).join("\n");
const bindingLines = BUILTINS.map((name) => {
  const ident = name.replace(/-/g, "_");
  return `var __builtin_${ident} = __ns_${ident}.default ?? __ns_${ident};`;
}).join("\n");
const mapEntries = BUILTINS.map(
  (name) => `  ${JSON.stringify(name)}: __builtin_${name.replace(/-/g, "_")},`,
).join("\n");

const patched = source.replace(
  requireDecl,
  `${importLines}\n${bindingLines}\n/* ${PATCH_ID} */\nvar __nodeBuiltins = {\n${mapEntries}\n};\nvar __rawRequire = /* #__PURE__ */ (() => createRequire(import.meta.url || "file:///"))();\nvar __require = (id) =>\n  Object.prototype.hasOwnProperty.call(__nodeBuiltins, id)\n    ? __nodeBuiltins[id]\n    : __rawRequire(id);`,
);

writeFileSync(runtimePath, patched);
console.log(`[${PATCH_ID}] patched ${runtimePath} (${BUILTINS.length} builtins mapped)`);
