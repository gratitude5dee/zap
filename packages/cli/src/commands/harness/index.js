// @ts-check
// zap harness ls|bake <template>|doctor <id|template>|run <template> --prompt
// over the harness manifests in @wzrdtech/zap-runtime. Plan-only is the
// default everywhere: `bake` and `run` print the plan unless --live, live
// bakes go through infra/box/build-template.sh, and no output ever contains
// a secret (C24 — manifests and plans are non-secret by construction).
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { usageError, ZapCliError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";

const USAGE = "zap harness <ls|bake <template>|doctor <id|template>|run <template> --prompt <p>> [--live] [--json]";

const NAMED_SNAPSHOTS = new Set(["zap-heavy", "zap-heavy-hermes", "zap-heavy-exo", "zap-heavy-openclaw", "zap-heavy-opencode"]);

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "harness",
  summary: "List, bake, doctor, and run zap-heavy harness templates",
  usage: USAGE,
  async run(ctx) {
    const [subcommand, ...rest] = ctx.args;
    const sub = { ...ctx, args: rest };
    switch (subcommand) {
      case "ls": return harnessLs(sub);
      case "bake": return harnessBake(sub);
      case "doctor": return harnessDoctor(sub);
      case "run": return harnessRun(sub);
      default:
        throw usageError(`Usage: ${USAGE}`);
    }
  },
};

async function manifestsModule() {
  return import("@wzrdtech/zap-runtime/harness/manifests");
}

function templatesRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../templates");
}

/** @param {string} template */
function harnessIdFor(template) {
  return template === "zap-heavy" ? undefined : template.replace(/^zap-heavy-/, "");
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function harnessLs({ flags }) {
  const { allHarnessManifests } = await manifestsModule();
  const harnesses = allHarnessManifests().map((manifest) => ({
    id: manifest.id,
    run: manifest.run,
    minWeight: manifest.minWeight,
    inProcess: manifest.inProcess === true,
    pullOnly: manifest.pullOnly === true,
    ports: manifest.ports,
    pins: manifest.pins,
  }));
  if (flags.json) printJson({ harnesses });
  else harnesses.forEach((h) => console.log(`${h.id}\t${h.run}\t${h.minWeight}`));
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function harnessBake({ args, flags }) {
  const template = args[0];
  if (!template) throw usageError(`Usage: ${USAGE}`);
  const dir = path.join(templatesRoot(), template);
  if (!existsSync(path.join(dir, "template.json"))) {
    throw new ZapCliError({ code: "HARNESS_TEMPLATE_NOT_FOUND", message: `Template ${template} was not found under packages/templates.` });
  }
  const spec = JSON.parse(await fs.readFile(path.join(dir, "template.json"), "utf8"));
  const namedSnapshot = NAMED_SNAPSHOTS.has(template);
  const plan = {
    template,
    from: spec.from,
    namedSnapshot,
    mode: namedSnapshot ? "infra/box/build-template.sh + verify" : "overlay: POST /boxes {from, setupScript} or post-ready /commands",
    steps: [`bake ${template}/bake.sh`, `doctor ${template}/doctor.sh`, "infra/box/secret-sweep.sh"],
    live: flags.live === true,
  };
  if (flags.live !== true) {
    if (flags.json) printJson({ planned: true, ...plan });
    else console.log(`plan-only: would bake ${template} (${plan.mode}). Re-run with --live to build.`);
    return;
  }
  const { execFileSync } = await import("node:child_process");
  const script = path.resolve(templatesRoot(), "../../infra/box/build-template.sh");
  execFileSync("bash", [script, template], { stdio: "inherit" });
  if (flags.json) printJson({ planned: false, ...plan, ok: true });
  else console.log(`baked ${template}`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function harnessDoctor({ args, flags }) {
  const target = args[0];
  if (!target) throw usageError(`Usage: ${USAGE}`);
  const { allHarnessManifests } = await manifestsModule();
  const template = target.startsWith("zap-heavy") ? target : `zap-heavy-${target}`;
  const id = harnessIdFor(template);
  const dir = path.join(templatesRoot(), template);
  const manifest = allHarnessManifests().find((m) => m.id === id);

  /** @type {Array<{ name: string, ok: boolean }>} */
  const checks = [];
  const templateJson = path.join(dir, "template.json");
  checks.push({ name: "template.json", ok: existsSync(templateJson) });
  checks.push({ name: "bake.sh", ok: existsSync(path.join(dir, "bake.sh")) });
  checks.push({ name: "doctor.sh", ok: existsSync(path.join(dir, "doctor.sh")) });
  if (id !== undefined) {
    checks.push({ name: "manifest", ok: manifest !== undefined });
    checks.push({ name: "pins", ok: manifest !== undefined && Object.keys(manifest.pins).length > 0 });
    if (existsSync(templateJson)) {
      const spec = JSON.parse(await fs.readFile(templateJson, "utf8"));
      checks.push({ name: "harness matches template", ok: spec.harness === id });
      checks.push({
        name: "hosted ports private",
        ok: (spec.ports ?? []).every((/** @type {{ hostPrivate?: boolean }} */ p) => p.hostPrivate === true),
      });
    }
  }
  const ok = checks.every((check) => check.ok);
  if (flags.json) printJson({ template, harness: id ?? null, ok, checks, note: id === "grok" ? "xAI-routed; in-box checks run via doctor.sh on a live box" : "in-box checks run via doctor.sh on a live box" });
  else {
    checks.forEach((check) => console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}`));
    if (id === "grok") console.log("note xAI-routed");
  }
  if (!ok) throw new ZapCliError({ code: "HARNESS_DOCTOR_FAILED", message: `harness doctor failed for ${template}` });
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function harnessRun({ args, flags }) {
  const template = args[0];
  const prompt = typeof flags.prompt === "string" ? flags.prompt : undefined;
  if (!template || !prompt) throw usageError(`Usage: ${USAGE}`);
  const id = harnessIdFor(template);
  const { allHarnessManifests } = await manifestsModule();
  const manifest = allHarnessManifests().find((m) => m.id === id);
  if (!manifest) throw new ZapCliError({ code: "HARNESS_UNKNOWN", message: `No harness manifest for template ${template}.` });
  if (manifest.pullOnly === true) {
    throw new ZapCliError({
      code: "HARNESS_PULL_ONLY",
      message: `harness.${manifest.id} is pull-only: work arrives from its control plane.`,
    });
  }
  if (flags.live === true) {
    throw new ZapCliError({
      code: "HARNESS_RUN_PLAN_ONLY",
      message: "Live harness runs go through `zap runtime exec <id> --prompt` against a running runtime; `zap harness run` is plan-only.",
    });
  }
  const events = [
    { type: "run.started", live: false, payer: "byok" },
    { type: "tool.planned", tool: `harness.${manifest.id}`, input: { prompt }, estimate: { adapter: manifest.run } },
    { type: "run.completed", usage: { planned: true } },
  ];
  if (flags.json) printJson({ template, harness: manifest.id, planned: true, events });
  else events.forEach((event) => console.log(JSON.stringify(event)));
}
