#!/usr/bin/env node
// Fan the canonical connectivity fragments out to every runtime template.
//
// infra/box/build-template.sh uploads exactly one template directory to the
// build box, so each template needs its own copy of the fragments. This script
// is the only writer of packages/templates/*/connectivity/; `--check` fails if
// a copy has drifted, which is what tests/connectivity-fragments.test.ts runs.
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "infra", "connectivity");
const TEMPLATES = path.join(ROOT, "packages", "templates");

export function connectivitySourceFiles() {
  return readdirSync(SOURCE).filter((name) => name.endsWith(".sh") || name.endsWith(".py")).sort();
}

export function connectivityTemplates() {
  return readdirSync(TEMPLATES)
    .filter((name) => name.startsWith("zap-"))
    .filter((name) => statSync(path.join(TEMPLATES, name)).isDirectory())
    .filter((name) => existsSync(path.join(TEMPLATES, name, "bake.sh")))
    .sort();
}

export function connectivityDrift() {
  const drift = [];
  for (const template of connectivityTemplates()) {
    for (const file of connectivitySourceFiles()) {
      const target = path.join(TEMPLATES, template, "connectivity", file);
      const expected = readFileSync(path.join(SOURCE, file), "utf8");
      if (!existsSync(target) || readFileSync(target, "utf8") !== expected) {
        drift.push(path.relative(ROOT, target));
      }
    }
  }
  return drift;
}

function sync() {
  for (const template of connectivityTemplates()) {
    const dir = path.join(TEMPLATES, template, "connectivity");
    mkdirSync(dir, { recursive: true });
    for (const file of connectivitySourceFiles()) {
      writeFileSync(path.join(dir, file), readFileSync(path.join(SOURCE, file), "utf8"), { mode: 0o755 });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const drift = connectivityDrift();
    if (drift.length > 0) {
      console.error(`connectivity fragments out of date:\n  ${drift.join("\n  ")}\nrun: npm run connectivity:sync`);
      process.exit(1);
    }
    console.log("connectivity fragments in sync");
  } else {
    sync();
    console.log(`synced connectivity fragments into ${connectivityTemplates().length} templates`);
  }
}
