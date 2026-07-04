import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument, stringify } from "yaml";

const version = "0.1.0";
const commands = [
  "init",
  "new",
  "validate",
  "lint",
  "run",
  "status",
  "dev",
  "studio",
  "add",
  "docs",
  "skills",
  "doctor",
  "info",
  "upgrade",
  "improve",
  "feedback",
  "telemetry",
];

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

await main(process.argv.slice(2)).catch((error) => {
  printError(error);
  process.exitCode = 1;
});

async function main(argv) {
  loadDotEnv(process.cwd());
  const { args, flags } = parseArgs(argv);
  const command = args[0];

  if (flags.version || command === "--version" || command === "-v") {
    console.log(version);
    return;
  }
  if (!command || flags.help || command === "help") {
    printHelp();
    return;
  }
  if (!commands.includes(command)) {
    throw new Error(`Unknown command "${command}". Run zap help.`);
  }

  switch (command) {
    case "init":
      await initCommand(args.slice(1), flags);
      break;
    case "new":
      await newCommand(args.slice(1), flags);
      break;
    case "validate":
      await validateCommand(args.slice(1), flags);
      break;
    case "lint":
      await lintCommand(args.slice(1), flags);
      break;
    case "run":
      await runCommand(args.slice(1), flags);
      break;
    case "status":
      await statusCommand(args.slice(1), flags);
      break;
    case "dev":
      proxyPackageScript("dev", flags);
      break;
    case "studio":
      proxyPackageScript("dev", flags, ["--", "--turbo"]);
      break;
    case "add":
      await addCommand(args.slice(1), flags);
      break;
    case "docs":
      await docsCommand(args.slice(1), flags);
      break;
    case "skills":
      await skillsCommand(args.slice(1), flags);
      break;
    case "doctor":
      await doctorCommand(flags);
      break;
    case "info":
      await infoCommand(flags);
      break;
    case "upgrade":
      await upgradeCommand(flags);
      break;
    case "improve":
      await improveCommand(args.slice(1), flags);
      break;
    case "feedback":
      await feedbackCommand(args.slice(1), flags);
      break;
    case "telemetry":
      await telemetryCommand(args.slice(1), flags);
      break;
  }
}

async function initCommand(args, flags) {
  const target = args[0];
  if (!target) throw new Error("Usage: zap init <directory> [--non-interactive]");
  const root = path.resolve(process.cwd(), target);
  await fs.mkdir(path.join(root, "agent", "skills"), { recursive: true });
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.mkdir(path.join(root, ".zap"), { recursive: true });
  await writeNewFile(path.join(root, "package.json"), JSON.stringify({
    name: slugify(path.basename(root)),
    private: true,
    devDependencies: {
      "@wzrdtech/zap": version,
    },
    scripts: {
      "zap:docs": "zap docs",
      "zap:doctor": "zap doctor",
      "zap:new": "zap new",
      "zap:run": "zap run",
      "zap:skills": "zap skills check",
      "zap:status": "zap status",
      "zap:validate": "zap validate",
    },
    type: "module",
  }, null, 2) + "\n");
  await writeNewFile(path.join(root, "AGENTS.md"), [
    "# Zap Agent Project",
    "",
    "Use `zap new`, `zap validate`, `zap lint`, and `zap run --json` before shipping recipes.",
    "Mock mode is the default. Use `--live` only after provider keys and budget approval are present.",
    "",
  ].join("\n"));
  await writeNewFile(path.join(root, ".gitignore"), ".env*\n!.env.example\n.zap/runs\nnode_modules\n");
  await writeNewFile(path.join(root, ".env.example"), [
    "ZAP_PROVIDER=mock",
    "UPSTASH_REDIS_REST_URL=",
    "UPSTASH_REDIS_REST_TOKEN=",
    "NEXT_PUBLIC_CONVEX_URL=",
    "NEXT_PUBLIC_SUPABASE_URL=",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
  ].join("\n") + "\n");
  if (!flags.empty) {
    await scaffoldRecipe(root, flags.example ? String(flags.example) : "hello-world", { force: false });
  }
  if (!flags.json) console.log(`Initialized Zap project at ${root}`);
  else printJson({ ok: true, root });
}

async function newCommand(args, flags) {
  assertZapProject(process.cwd());
  const rawSlug = args[0];
  if (!rawSlug) throw new Error("Usage: zap new <slug> [--force]");
  const { skillDir, slug } = await scaffoldRecipe(process.cwd(), rawSlug, flags);
  if (flags.json) printJson({ ok: true, skillDir, slug });
  else console.log(`Created zap-${slug} at ${skillDir}`);
}

async function scaffoldRecipe(projectRoot, rawSlug, flags) {
  const slug = slugify(rawSlug);
  const skillDir = path.join(projectRoot, "agent", "skills", `zap-${slug}`);
  await fs.mkdir(path.join(skillDir, "prompts"), { recursive: true });
  const skillMd = `# zap-${slug}\n\nUse this skill when a creator wants the ${titleize(slug)} Zap.\n`;
  const zapMd = [
    "---",
    stringify({
      budget: { cap_usd: 5, estimate_usd: 0 },
      defaults: { provider: "mock" },
      description: `A one-click ${titleize(slug)} content recipe.`,
      inputs: {
        PROMPT: {
          hint: "Describe the scene or transformation.",
          label: "Prompt",
          required: true,
          type: "textarea",
        },
      },
      output: "Zap.mp4",
      steps: [
        {
          id: "initial_frame",
          kind: "image.gen",
          model: "mock-image",
          prompt: "prompts/initial-frame.md",
          provider: "mock",
        },
        {
          duration_s: 15,
          id: "initial_gen",
          inputs: ["initial_frame"],
          kind: "video.gen",
          model: "mock-video",
          prompt: "prompts/initial-gen.md",
          provider: "mock",
        },
        {
          id: "stitch",
          inputs: ["initial_gen"],
          kind: "stitch",
          stitch: { engine: "auto", format: "mp4", quality: "standard" },
        },
      ],
      version: 1,
      zap: slug,
    }).trim(),
    "---",
    "",
    `# ${titleize(slug)}`,
    "",
  ].join("\n");

  await writeRecipeFile(path.join(skillDir, "SKILL.md"), skillMd, flags.force);
  await writeRecipeFile(path.join(skillDir, "Zap.md"), zapMd, flags.force);
  await writeRecipeFile(path.join(skillDir, "prompts", "initial-frame.md"), "Create a cinematic first frame for: {PROMPT}\n", flags.force);
  await writeRecipeFile(path.join(skillDir, "prompts", "initial-gen.md"), "Animate the first frame into a polished 15 second video: {PROMPT}\n", flags.force);
  return { skillDir, slug };
}

async function validateCommand(args, flags) {
  const files = await resolveZapFiles(args);
  const results = [];
  for (const file of files) {
    const spec = await parseZapFile(file);
    validateSpec(spec);
    results.push({ file, ok: true, zap: spec.zap });
  }
  if (flags.json) printJson({ results });
  else results.forEach((result) => console.log(`ok ${result.file} (${result.zap})`));
}

async function lintCommand(args, flags) {
  const files = await resolveZapFiles(args);
  const results = [];
  for (const file of files) {
    const spec = await parseZapFile(file);
    const warnings = lintSpec(spec);
    results.push({ file, ok: warnings.length === 0, warnings, zap: spec.zap });
  }
  if (flags.json) printJson({ results });
  else {
    for (const result of results) {
      console.log(`${result.ok ? "ok" : "warn"} ${result.file} (${result.zap})`);
      result.warnings.forEach((warning) => console.log(`  - ${warning}`));
    }
  }
}

async function runCommand(args, flags) {
  const file = (await resolveZapFiles(args))[0];
  if (!file) throw new Error("Usage: zap run <slug|Zap.md> [--input KEY=VALUE] [--live] [--json]");
  const spec = await parseZapFile(file);
  validateSpec(spec);
  const inputs = withMockInputDefaults(spec, parseInputFlags(flags.input), Boolean(flags.live));
  if (flags.live) validateRequiredInputs(spec, inputs);
  const extendCount = Number(flags.extend ?? spec.steps.find((step) => step.kind === "video.extend")?.repeat?.default ?? 0);
  const steps = expandSteps(spec, extendCount);
  const quoteUsd = flags.live ? estimateUsd(steps) : 0;
  if (quoteUsd > spec.budget.cap_usd) {
    throw new Error(`Run quote $${quoteUsd.toFixed(2)} exceeds recipe cap $${spec.budget.cap_usd}.`);
  }
  const runId = `run_${Date.now().toString(36)}_${createHash("sha1").update(file).digest("hex").slice(0, 6)}`;
  const result = {
    live: Boolean(flags.live),
    message: flags.live ? "Live provider run planned. Use the web runtime to submit provider jobs." : "Mock Zap run completed.",
    mode: flags.live ? "live" : "mock",
    quoteUsd,
    runId,
    status: flags.live ? "queued" : "done",
    steps: steps.map((step) => ({
      kind: step.kind,
      model: step.model ?? "local",
      provider: flags.live ? step.provider ?? spec.defaults?.provider ?? "gmi" : "mock",
      quoteUsd: flags.live ? quoteStep(step) : 0,
      status: "done",
      stepId: step.id,
    })),
    zap: spec.zap,
    zapUrl: flags.live ? undefined : `mock://zap/${spec.zap}/${runId}/Zap.mp4`,
  };
  await fs.mkdir(path.join(process.cwd(), ".zap", "runs", runId), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), ".zap", "runs", runId, "result.json"), JSON.stringify(result, null, 2) + "\n");
  if (flags.json) printJson(result);
  else console.log(`${result.message} ${runId}`);
}

async function statusCommand(args, flags) {
  const runId = args[0];
  const runsDir = path.join(process.cwd(), ".zap", "runs");
  if (runId) {
    const file = path.join(runsDir, runId, "result.json");
    const result = JSON.parse(await fs.readFile(file, "utf8"));
    if (flags.json) printJson(result);
    else console.log(`${result.runId} ${result.status} ${result.zapUrl ?? ""}`.trim());
    return;
  }
  const runs = existsSync(runsDir) ? await fs.readdir(runsDir) : [];
  if (flags.json) printJson({ runs });
  else runs.forEach((run) => console.log(run));
}

async function addCommand(args, flags) {
  assertZapProject(process.cwd());
  const name = args[0];
  if (!name) throw new Error("Usage: zap add <registry-name>");
  const normalizedName = name.startsWith("zap-") ? name : `zap-${slugify(name)}`;
  const registryDir = path.join(findResourceRoot(), "registry", "zaps", normalizedName);
  const targetDir = path.join(process.cwd(), "agent", "skills", normalizedName);
  if (!existsSync(registryDir)) throw new Error(`Registry entry ${name} was not found.`);
  await copyDir(registryDir, targetDir, Boolean(flags.force));
  if (flags.json) printJson({ ok: true, targetDir });
  else console.log(`Added ${name} to ${targetDir}`);
}

async function docsCommand(args, flags) {
  const requestedTopic = args[0] ?? "index";
  const aliases = {
    agents: "quickstart/agents",
    cli: "reference/cli",
    deploy: "deploy",
    providers: "providers",
    runtime: "reference/runtime",
    schema: "zap-spec",
    "supabase-secrets": "deployment/supabase-secrets",
    vercel: "deployment/vercel",
    "zap-spec": "zap-spec",
  };
  const topic = aliases[requestedTopic] ?? requestedTopic;
  const docsRoot = path.join(findResourceRoot(), "docs");
  const candidates = [
    path.join(docsRoot, `${topic}.md`),
    path.join(docsRoot, "quickstart", `${topic}.md`),
    path.join(docsRoot, "reference", `${topic}.md`),
    path.join(docsRoot, "deployment", `${topic}.md`),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) {
    const topics = await listMarkdownTopics(docsRoot);
    if (flags.json) printJson({ requestedTopic, topics });
    else topics.forEach((entry) => console.log(entry));
    return;
  }
  const content = await fs.readFile(file, "utf8");
  if (flags.json) printJson({ content, file, requestedTopic, topic });
  else console.log(content);
}

async function skillsCommand(args, flags) {
  const subcommand = args[0] ?? "generate";
  const resourceRoot = findResourceRoot();
  const skillsDir = path.join(resourceRoot, "skills");
  const manifest = await generateSkillManifest(skillsDir, resourceRoot);
  const manifestPath = path.join(skillsDir, "skills-manifest.json");
  if (subcommand === "check") {
    const existing = existsSync(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, "utf8")) : null;
    const differences = compareSkillManifests(existing, manifest);
    const result = { differences, manifestPath, ok: differences.length === 0 };
    if (flags.json) printJson(result);
    else if (result.ok) console.log(`ok ${manifestPath}`);
    else differences.forEach((difference) => console.log(`mismatch ${difference}`));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (subcommand !== "generate" && subcommand !== "update") {
    throw new Error("Usage: zap skills [generate|update|check] [--json]");
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (flags.json) printJson(manifest);
  else {
    console.log(`Generated ${manifestPath}`);
    manifest.skills.forEach((skill) => console.log(`${skill.skill} ${skill.fileCount} ${skill.hash.slice(0, 12)}`));
  }
}

async function doctorCommand(flags) {
  const checks = [];
  checks.push(check("node", Number(process.versions.node.split(".")[0]) >= 24, `Node ${process.versions.node}`));
  checks.push(check("package", existsSync(path.join(process.cwd(), "package.json")), "package.json present"));
  checks.push(check("zap skills", existsSync(path.join(process.cwd(), "agent", "skills")), "agent/skills present"));
  checks.push(check("convex", Boolean(process.env.NEXT_PUBLIC_CONVEX_URL), "NEXT_PUBLIC_CONVEX_URL configured"));
  checks.push(check("upstash", Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN), "Upstash REST env configured"));
  checks.push(check("supabase", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)), "Supabase public env configured"));
  checks.push(check("hyperframes", hasExecutable("npx") && canRun("npx", ["hyperframes", "--version"]), "optional HyperFrames CLI available"));
  if (flags.json) printJson({ checks });
  else checks.forEach((item) => console.log(`${item.ok ? "ok" : "warn"} ${item.name}: ${item.detail}`));
}

async function infoCommand(flags) {
  const info = {
    cwd: process.cwd(),
    node: process.versions.node,
    platform: `${os.platform()} ${os.arch()}`,
    version,
  };
  if (flags.json) printJson(info);
  else Object.entries(info).forEach(([key, value]) => console.log(`${key}: ${value}`));
}

async function upgradeCommand(flags) {
  const message = "Upgrade checks are intentionally local in v0.1. Reinstall @wzrdtech/zap to upgrade.";
  if (flags.json) printJson({ message });
  else console.log(message);
}

async function improveCommand(args, flags) {
  const requested = args[0];
  if (!requested) throw new Error("Usage: zap improve <slug|Zap.md> [--json] [--write]");
  const file = resolveZapFile(requested);
  const spec = await parseZapFile(file);
  validateSpec(spec);
  const evidence = await readImproveEvidenceForZap(spec.zap);
  const { feedback, runs } = evidence;
  const warnings = lintSpec(spec);
  const failedRuns = runs.filter((run) => run.status === "failed" || run.status === "canceled");
  const doneRuns = runs.filter((run) => run.status === "done");
  const stepFailures = summarizeStepFailures(runs);
  const recommendations = buildImproveRecommendations({ failedRuns, feedback, spec, stepFailures, warnings });
  const proposal = {
    currentVersion: spec.version,
    evidence: {
      doneRuns: doneRuns.length,
      failedRuns: failedRuns.length,
      feedbackCount: feedback.length,
      sources: evidence.sources,
      latestRunId: runs.at(-1)?.runId,
      lintWarnings: warnings,
      stepFailures,
    },
    file,
    proposedVersion: Number(spec.version ?? 0) + 1,
    recommendations,
    slug: spec.zap,
    summary: recommendations.length === 0
      ? "No strong improvement signal found yet. Collect more runs, judge scores, or creator feedback before bumping the recipe."
      : `Propose v${Number(spec.version ?? 0) + 1} with ${recommendations.length} improvement(s) grounded in run/feedback evidence.`,
  };

  if (flags.write) {
    const dir = path.join(process.cwd(), ".zap", "improvements");
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${spec.zap}-v${proposal.proposedVersion}.md`);
    await fs.writeFile(target, renderImproveProposal(proposal, feedback));
    proposal.path = target;
  }

  if (flags.json) printJson(proposal);
  else {
    console.log(`${proposal.slug}: ${proposal.summary}`);
    proposal.recommendations.forEach((item, index) => console.log(`${index + 1}. ${item}`));
    if (proposal.path) console.log(`Wrote ${proposal.path}`);
  }
}

async function feedbackCommand(args, flags) {
  const message = args.join(" ").trim();
  if (!message) throw new Error("Usage: zap feedback <message>");
  const dir = path.join(process.cwd(), ".zap");
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, "feedback.ndjson"), JSON.stringify({ createdAt: new Date().toISOString(), message }) + "\n");
  if (flags.json) printJson({ ok: true });
  else console.log("Feedback saved locally.");
}

async function telemetryCommand(args, flags) {
  const value = args[0] ?? "status";
  const dir = path.join(process.cwd(), ".zap");
  const file = path.join(dir, "telemetry.json");
  await fs.mkdir(dir, { recursive: true });
  if (value === "on" || value === "off") {
    await fs.writeFile(file, JSON.stringify({ enabled: value === "on" }, null, 2) + "\n");
  }
  const enabled = existsSync(file) ? JSON.parse(await fs.readFile(file, "utf8")).enabled : false;
  if (flags.json) printJson({ enabled });
  else console.log(`Telemetry ${enabled ? "on" : "off"}`);
}

function parseArgs(argv) {
  const flags = {};
  const args = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) {
      args.push(arg);
      continue;
    }
    const withoutPrefix = arg.replace(/^--?/, "");
    const [rawKey, inlineValue] = withoutPrefix.split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      setFlag(flags, key, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      setFlag(flags, key, next);
      index += 1;
    } else {
      setFlag(flags, key, true);
    }
  }
  return { args, flags };
}

function setFlag(flags, key, value) {
  if (flags[key] === undefined) {
    flags[key] = value;
    return;
  }
  flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
}

async function resolveZapFiles(args) {
  if (args.length > 0) return args.map((entry) => resolveZapFile(entry));
  const skillsDir = path.join(process.cwd(), "agent", "skills");
  if (!existsSync(skillsDir)) return [];
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, "Zap.md"))
    .filter((file) => existsSync(file));
}

function resolveZapFile(entry) {
  const direct = path.resolve(process.cwd(), entry);
  const slug = slugify(entry.replace(/\.md$/i, ""));
  const candidates = [
    direct,
    path.join(process.cwd(), "agent", "skills", entry, "Zap.md"),
    path.join(process.cwd(), "agent", "skills", `zap-${slug}`, "Zap.md"),
    path.join(process.cwd(), "agent", "skills", slug, "Zap.md"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? direct;
}

async function parseZapFile(file) {
  const content = await fs.readFile(file, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${file} is missing YAML frontmatter.`);
  const parsed = parseDocument(match[1]).toJS();
  return parsed;
}

function validateSpec(spec) {
  const required = ["zap", "version", "description", "budget", "steps"];
  for (const key of required) {
    if (spec[key] === undefined) throw new Error(`Zap is missing required field ${key}.`);
  }
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) throw new Error("Zap must include at least one step.");
  const inputNames = new Set(Object.keys(spec.inputs ?? {}));
  const stepIds = new Set();
  for (const step of spec.steps) {
    if (!step.id || !step.kind) throw new Error("Every step needs id and kind.");
    if (stepIds.has(step.id)) throw new Error(`Duplicate step id ${step.id}.`);
    stepIds.add(step.id);
    for (const variable of String(step.prompt ?? "").matchAll(/\{([A-Z0-9_]+)\}/g)) {
      if (!inputNames.has(variable[1])) throw new Error(`Step ${step.id} references undeclared input {${variable[1]}}.`);
    }
    if (step.kind === "stitch" && step.stitch?.engine === "hyperframes" && !existsSync(path.join(process.cwd(), "DESIGN.md"))) {
      throw new Error("HyperFrames stitch requires a DESIGN.md visual identity.");
    }
  }
}

function validateRequiredInputs(spec, inputs) {
  for (const [name, input] of Object.entries(spec.inputs ?? {})) {
    if (input.required && inputs[name] === undefined) {
      throw new Error(`Missing required input ${name}. Use --input ${name}=value.`);
    }
  }
}

function parseInputFlags(value) {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const inputs = {};
  for (const item of values) {
    const text = String(item);
    const separator = text.indexOf("=");
    if (separator === -1) throw new Error(`Invalid --input "${text}". Expected KEY=VALUE.`);
    inputs[text.slice(0, separator)] = text.slice(separator + 1);
  }
  return inputs;
}

function withMockInputDefaults(spec, inputs, live) {
  if (live) return inputs;
  const next = { ...inputs };
  for (const [name, input] of Object.entries(spec.inputs ?? {})) {
    if (input.required && next[name] === undefined) {
      next[name] = input.type === "image" ? `mock://input/${name}` : `mock-${name.toLowerCase()}`;
    }
  }
  return next;
}

function lintSpec(spec) {
  const warnings = [];
  if (spec.defaults?.provider !== "mock" && !process.env.ZAP_LINT_ALLOW_LIVE_DEFAULT) {
    warnings.push("defaults.provider is live; mock is safer for published templates.");
  }
  if (Number(spec.budget?.cap_usd ?? 0) <= 0) warnings.push("budget.cap_usd should be positive.");
  if (!spec.steps.some((step) => step.kind === "stitch")) warnings.push("Zap should end with a stitch step.");
  return warnings;
}

function expandSteps(spec, extendCount) {
  return spec.steps.flatMap((step) => {
    if (step.kind !== "video.extend") return [step];
    const max = step.repeat?.max ?? 64;
    const count = Math.max(step.repeat?.min ?? 0, Math.min(extendCount, max));
    return Array.from({ length: count }, (_, index) => ({ ...step, id: `${step.id}_${index + 1}` }));
  });
}

function quoteStep(step) {
  if (step.kind === "stitch" || step.kind === "keyframes") return 0;
  const rates = {
    "fal-ai/flux/dev": { perRequest: 0.03 },
    "fal-ai/kling-video/v2.1/pro/image-to-video": { perSecond: 0.28 },
    "fal-ai/veo3.1": { perSecond: 0.45 },
    "gemini-omni-flash-preview": { perSecond: 0.1 },
    "happyhorse-1.1-i2v": { perSecond: 0.28 },
    "seedance-2-0-260128": { perSecond: 0.07 },
    "seedance-2-0-260128-upscale": { perSecond: 0.056 },
  };
  const rate = rates[step.model ?? "local"];
  if (!rate) return 0;
  return rate.perRequest ?? (rate.perSecond ?? 0) * (step.duration_s ?? 1);
}

function estimateUsd(steps) {
  return steps.reduce((sum, step) => sum + quoteStep(step), 0);
}

async function readLocalRunsForZap(slug) {
  const runsDir = path.join(process.cwd(), ".zap", "runs");
  if (!existsSync(runsDir)) return [];
  const entries = await fs.readdir(runsDir);
  const runs = [];
  for (const entry of entries) {
    const file = path.join(runsDir, entry, "result.json");
    if (!existsSync(file)) continue;
    try {
      const run = JSON.parse(await fs.readFile(file, "utf8"));
      if (run.zap === slug || run.zapSlug === slug) runs.push(run);
    } catch {
      // Ignore malformed local traces; improve should use available evidence.
    }
  }
  return runs.sort((left, right) => String(left.runId).localeCompare(String(right.runId)));
}

async function readImproveEvidenceForZap(slug) {
  const localRuns = await readLocalRunsForZap(slug);
  const localFeedback = await readLocalFeedback();
  const convexEvidence = await readConvexEvidenceForZap(slug);
  return {
    feedback: mergeFeedback([...localFeedback, ...convexEvidence.feedback]),
    runs: mergeRuns([...localRuns, ...convexEvidence.runs]),
    sources: {
      convexAvailable: convexEvidence.available,
      convexError: convexEvidence.error,
      convexRuns: convexEvidence.runs.length,
      localFeedback: localFeedback.length,
      localRuns: localRuns.length,
    },
  };
}

async function readConvexEvidenceForZap(slug) {
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return { available: false, feedback: [], runs: [] };
  try {
    const [{ ConvexHttpClient }, { makeFunctionReference }] = await Promise.all([
      import("convex/browser"),
      import("convex/server"),
    ]);
    const client = new ConvexHttpClient(convexUrl);
    const listByZap = makeFunctionReference("runs:listByZap");
    const snapshots = await client.query(listByZap, { limit: 50, zapSlug: slug });
    const normalizedRuns = [];
    const feedback = [];
    for (const snapshot of snapshots ?? []) {
      if (!snapshot?.run) continue;
      normalizedRuns.push(normalizeConvexRun(snapshot));
      feedback.push(...(snapshot.feedback ?? []).map((entry) => ({ ...entry, source: "convex" })));
    }
    return { available: true, feedback, runs: normalizedRuns };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      feedback: [],
      runs: [],
    };
  }
}

function normalizeConvexRun(snapshot) {
  const run = snapshot.run;
  return {
    ...run,
    source: "convex",
    steps: (snapshot.steps ?? []).map((step) => ({
      ...step,
      quoteUsd: step.quoteUsd ?? step.priceQuoteUsd ?? 0,
      stepId: step.stepId ?? step.id,
    })),
  };
}

function mergeRuns(runs) {
  const byRunId = new Map();
  for (const run of runs) {
    if (!run?.runId) continue;
    const existing = byRunId.get(run.runId);
    if (!existing || run.source === "convex") byRunId.set(run.runId, run);
  }
  return Array.from(byRunId.values()).sort((left, right) =>
    Number(left.startedAt ?? 0) - Number(right.startedAt ?? 0) || String(left.runId).localeCompare(String(right.runId)),
  );
}

function mergeFeedback(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = entry?._id ?? `${entry?.runId ?? "local"}:${entry?.stepId ?? "run"}:${entry?.createdAt ?? ""}:${entry?.message ?? entry?.comment ?? ""}`;
    byKey.set(key, entry);
  }
  return Array.from(byKey.values()).sort((left, right) =>
    Number(left.createdAt ?? 0) - Number(right.createdAt ?? 0),
  );
}

async function readLocalFeedback() {
  const file = path.join(process.cwd(), ".zap", "feedback.ndjson");
  if (!existsSync(file)) return [];
  const content = await fs.readFile(file, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function summarizeStepFailures(runs) {
  const failures = {};
  for (const run of runs) {
    for (const step of run.steps ?? []) {
      if (step.status !== "failed" && !step.error) continue;
      const key = step.stepId ?? step.id ?? step.kind ?? "unknown";
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }
  return failures;
}

function buildImproveRecommendations({ failedRuns, feedback, spec, stepFailures, warnings }) {
  const recommendations = [];
  if (warnings.some((warning) => warning.includes("defaults.provider is live"))) {
    recommendations.push("Change published template defaults.provider to mock, or document why this recipe intentionally defaults live.");
  }
  if (failedRuns.length > 0 || Object.keys(stepFailures).length > 0) {
    recommendations.push("Add or tune per-step retry policies for failing provider steps, including fallback_provider/fallback_model where support exists.");
  }
  if (feedback.length > 0) {
    recommendations.push("Review local creator feedback and convert repeated comments into prompt, input, or judge-criteria changes before bumping the version.");
  }
  if (!spec.steps.some((step) => step.judge)) {
    recommendations.push("Add judge criteria to final video/image steps so future improvements can use scores instead of prose-only feedback.");
  }
  if (!spec.steps.some((step) => step.kind === "stitch")) {
    recommendations.push("Add a final stitch step so the recipe has a single replayable Zap output.");
  }
  return recommendations;
}

function renderImproveProposal(proposal, feedback) {
  const lines = [
    `# Improve ${proposal.slug} to v${proposal.proposedVersion}`,
    "",
    proposal.summary,
    "",
    "## Evidence",
    "",
    `- Done runs: ${proposal.evidence.doneRuns}`,
    `- Failed runs: ${proposal.evidence.failedRuns}`,
    `- Feedback entries: ${proposal.evidence.feedbackCount}`,
    `- Latest run: ${proposal.evidence.latestRunId ?? "none"}`,
    `- Sources: ${proposal.evidence.sources.convexRuns} Convex run(s), ${proposal.evidence.sources.localRuns} local run(s), ${proposal.evidence.sources.localFeedback} local feedback item(s)`,
    "",
    "## Recommendations",
    "",
    ...(proposal.recommendations.length ? proposal.recommendations.map((item) => `- ${item}`) : ["- Collect more run and feedback evidence before editing the recipe."]),
  ];
  if (feedback.length > 0) {
    lines.push("", "## Feedback Samples", "");
    for (const entry of feedback.slice(-5)) {
      lines.push(`- ${entry.createdAt ?? "unknown"}: ${entry.message ?? JSON.stringify(entry)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function writeNewFile(file, content) {
  if (existsSync(file)) return;
  await fs.writeFile(file, content);
}

async function writeRecipeFile(file, content, force) {
  if (existsSync(file) && !force) throw new Error(`${file} already exists. Re-run with --force to overwrite.`);
  await fs.writeFile(file, content);
}

async function copyDir(source, target, force) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) await copyDir(sourcePath, targetPath, force);
    else if (force || !existsSync(targetPath)) await fs.copyFile(sourcePath, targetPath);
  }
}

async function listMarkdownTopics(root) {
  if (!existsSync(root)) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listMarkdownTopics(fullPath);
    return entry.name.endsWith(".md") ? [path.relative(root, fullPath).replace(/\.md$/, "")] : [];
  }));
  return nested.flat().sort();
}

async function generateSkillManifest(skillsDir, baseDir = path.dirname(skillsDir)) {
  if (!existsSync(skillsDir)) return { generatedAt: new Date().toISOString(), skills: [], version: 1 };
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(skillsDir, entry.name);
    const files = await listFiles(root);
    const hash = createHash("sha256");
    for (const file of files) {
      hash.update(path.relative(root, file));
      hash.update(await fs.readFile(file));
    }
    skills.push({ fileCount: files.length, hash: hash.digest("hex"), path: path.relative(baseDir, root), skill: entry.name });
  }
  return { generatedAt: new Date().toISOString(), skills: skills.sort((left, right) => left.skill.localeCompare(right.skill)), version: 1 };
}

function compareSkillManifests(existing, current) {
  if (!existing) return ["missing skills-manifest.json"];
  const existingEntries = new Map((existing.skills ?? []).map((entry) => [entry.skill, entry]));
  const currentEntries = new Map(current.skills.map((entry) => [entry.skill, entry]));
  const differences = [];
  for (const [skill, entry] of currentEntries) {
    const prior = existingEntries.get(skill);
    if (!prior) {
      differences.push(`${skill} missing from manifest`);
      continue;
    }
    if (prior.hash !== entry.hash || prior.fileCount !== entry.fileCount || prior.path !== entry.path) {
      differences.push(`${skill} hash/file metadata changed`);
    }
  }
  for (const skill of existingEntries.keys()) {
    if (!currentEntries.has(skill)) differences.push(`${skill} exists in manifest but not on disk`);
  }
  return differences;
}

async function listFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return [fullPath];
  }));
  return files.flat().sort();
}

function proxyPackageScript(script, flags, extra = []) {
  const result = spawnSync("npm", ["run", script, ...extra], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0 && !flags.json) process.exitCode = result.status ?? 1;
}

function loadDotEnv(cwd) {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(cwd, file);
    if (!existsSync(envPath)) continue;
    const lines = execFileSync(process.execPath, ["-e", `
      const fs = require("fs");
      const content = fs.readFileSync(process.argv[1], "utf8");
      console.log(content);
    `, envPath], { encoding: "utf8" }).split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function findRepoRoot() {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "package.json")) && existsSync(path.join(current, "packages"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

function findResourceRoot() {
  const sourceRoot = findRepoRoot();
  if (existsSync(path.join(sourceRoot, "docs")) && existsSync(path.join(sourceRoot, "registry")) && existsSync(path.join(sourceRoot, "skills"))) {
    return sourceRoot;
  }
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundledRoot = path.join(packageRoot, "resources");
  if (existsSync(bundledRoot)) return bundledRoot;
  return sourceRoot;
}

function assertZapProject(root) {
  if (!existsSync(path.join(root, "package.json")) || !existsSync(path.join(root, "agent", "skills"))) {
    throw new Error("This command must run from a Zap project root. Run `zap init <dir>` first.");
  }
}

function hasExecutable(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  return result.status === 0;
}

function canRun(binary, args) {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 8000 });
  return result.status === 0;
}

function check(name, ok, detail) {
  return { detail, name, ok };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "zap";
}

function titleize(value) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`zap: ${message}`);
}

function printHelp() {
  console.log(`Zap CLI ${version}

Usage:
  zap <command> [options]

Commands:
  init <dir>          Create a lightweight Zap project
  new <slug>          Scaffold agent/skills/zap-<slug>
  validate [Zap.md]   Validate one or more recipes
  lint [Zap.md]       Run recipe policy checks
  run <Zap.md>        Run a mock Zap by default
  status [runId]      Show local run status
  dev                 Start the web app dev server
  studio              Start the web studio
  add <name>          Add a registry Zap
  docs [topic]        Print bundled docs
  skills              Generate or check skills/skills-manifest.json
  doctor              Check local setup
  info                Print environment info
  upgrade             Print upgrade guidance
  feedback <message>  Store local feedback
  improve <slug>      Propose a version bump from run and feedback evidence
  telemetry [on|off]  Manage local telemetry preference

Common flags:
  --json              Machine-readable output
  --live              Allow live provider spend for run
  --input KEY=VALUE   Provide a recipe input; repeatable
  --force             Overwrite generated recipe files
  --version           Print version
`);
}
