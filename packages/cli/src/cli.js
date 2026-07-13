import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseZapMarkdown, validateZapPromptTemplates } from "@wzrdtech/core/schema";
import { defaultModelFor, getProviderAdapter, listProviderAdapters } from "@wzrdtech/providers";
import { parseDocument, stringify } from "yaml";

const version = "0.3.1";
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
  "finalize",
  "gallery",
  "search",
  "import",
  "skills",
  "doctor",
  "embed",
  "info",
  "inspect",
  "keys",
  "login",
  "logout",
  "deploy",
  "mcp",
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
    case "finalize":
      await finalizeCommand(args.slice(1), flags);
      break;
    case "gallery":
      await galleryCommand(args.slice(1), flags);
      break;
    case "search":
      await searchCommand(args.slice(1), flags);
      break;
    case "import":
      await importCommand(args.slice(1), flags);
      break;
    case "skills":
      await skillsCommand(args.slice(1), flags);
      break;
    case "doctor":
      await doctorCommand(flags);
      break;
    case "embed":
      await embedCommand(args.slice(1), flags);
      break;
    case "info":
      await infoCommand(flags);
      break;
    case "inspect":
      await inspectCommand(args.slice(1), flags);
      break;
    case "keys":
      await keysCommand(args.slice(1), flags);
      break;
    case "login":
      await loginCommand(flags);
      break;
    case "logout":
      await logoutCommand(flags);
      break;
    case "deploy":
      await deployCommand(args.slice(1), flags);
      break;
    case "mcp":
      await mcpCommand(flags);
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
    "`zap run` plans spend without provider calls. Use `--live` only after provider keys and budget approval are present.",
    "",
  ].join("\n"));
  await writeNewFile(path.join(root, ".gitignore"), ".env*\n!.env.example\n.zap/runs\nnode_modules\n");
  await writeNewFile(path.join(root, ".env.example"), [
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
      defaults: {
        models: {
          "image.gen": "fal-ai/flux/dev",
          "video.gen": "fal-ai/kling-video/v2.1/pro/image-to-video",
        },
        provider: "fal",
      },
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
          model: "fal-ai/flux/dev",
          prompt: "prompts/initial-frame.md",
          provider: "fal",
        },
        {
          duration_s: 15,
          id: "initial_gen",
          inputs: ["initial_frame"],
          kind: "video.gen",
          model: "fal-ai/kling-video/v2.1/pro/image-to-video",
          prompt: "prompts/initial-gen.md",
          provider: "fal",
        },
        {
          id: "stitch",
          inputs: ["initial_gen"],
          kind: "stitch",
          stitch: { engine: "auto", format: "mp4", quality: "standard" },
        },
      ],
      version: 2,
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
  const budgetCapUsd = flags.budgetCapUsd === undefined ? undefined : Number(flags.budgetCapUsd);
  if (budgetCapUsd !== undefined) {
    if (!Number.isFinite(budgetCapUsd) || budgetCapUsd < 0) throw new Error("--budget-cap-usd must be a non-negative number.");
    spec.budget.cap_usd = budgetCapUsd;
  }
  validateSpec(spec);
  const inputs = withPlanInputDefaults(spec, parseInputFlags(flags.input), Boolean(flags.live));
  if (flags.live) validateRequiredInputs(spec, inputs);
  const extendCount = Number(flags.extend ?? spec.steps.find((step) => step.kind === "video.extend")?.repeat?.default ?? 0);
  const steps = expandSteps(spec, extendCount);
  const quoteUsd = estimateUsd(spec, steps);
  if (quoteUsd > spec.budget.cap_usd) {
    throw new Error(`Run quote $${quoteUsd.toFixed(2)} exceeds recipe cap $${spec.budget.cap_usd}.`);
  }
  const runId = `run_${Date.now().toString(36)}_${createHash("sha1").update(file).digest("hex").slice(0, 6)}`;
  const result = flags.live
    ? await runLiveZap({ file, inputs, runId, spec, steps })
    : {
      live: false,
      message: "Zap plan completed. No provider work submitted.",
      mode: "plan",
      quoteUsd,
      runId,
      status: "planned",
      steps: steps.map((step) => plannedStep(spec, step)),
      zap: spec.zap,
    };
  await fs.mkdir(path.join(process.cwd(), ".zap", "runs", runId), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), ".zap", "runs", runId, "result.json"), JSON.stringify(result, null, 2) + "\n");
  if (flags.json) printJson(result);
  else console.log(`${result.message} ${runId}`);
}

async function runLiveZap({ file, inputs, runId, spec, steps }) {
  const credentials = await readCredentialStore();
  const assetUrls = new Map();
  const runDir = path.join(process.cwd(), ".zap", "runs", runId);
  const results = [];

  for (const step of steps) {
    if (isLocalStep(step)) {
      const inputUrls = resolveStepInputUrls(step, inputs, assetUrls);
      const zapUrl = inputUrls.at(-1);
      results.push({ ...plannedStep(spec, step), assetUrl: zapUrl, status: "done" });
      if (zapUrl) assetUrls.set(step.id, zapUrl);
      continue;
    }

    const provider = step.provider ?? spec.defaults?.provider ?? "fal";
    const adapter = getProviderAdapter(provider);
    const model = step.model ?? spec.defaults?.models?.[step.kind] ?? defaultModelFor(provider, step.kind);
    const secrets = secretsForProvider(credentials, provider);
    const prompt = interpolate(await readPromptFile(file, step.prompt), inputs);
    const imageUrls = resolveStepInputUrls(step, inputs, assetUrls);
    const request = {
      capability: step.kind,
      durationS: step.duration_s,
      inputs: {
        ...inputs,
        imageUrl: imageUrls.at(0),
        imageUrls,
        referenceImages: imageUrls,
      },
      model,
      prompt,
      provider,
      runId,
      secrets,
      stepId: step.id,
    };
    const submitted = await adapter.submit(request, `zap:cli:${runId}:${step.id}`);
    const polled = await pollProviderUntilDone(adapter, submitted.requestId, secrets);
    if (!polled.outputUrl) throw new Error(`${provider} completed ${step.id} without an output URL.`);
    const assetUrl = await persistCliAsset(polled.outputUrl, path.join(runDir, "assets"), step.id);
    assetUrls.set(step.id, assetUrl);
    results.push({
      ...plannedStep(spec, step),
      actualUsd: polled.actualUsd,
      assetUrl,
      providerRequestId: submitted.requestId,
      status: "done",
    });
  }

  return {
    live: true,
    message: "Live Zap run completed.",
    mode: "live",
    quoteUsd: estimateUsd(spec, steps),
    runId,
    status: "done",
    steps: results,
    zap: spec.zap,
    zapUrl: assetUrls.get(steps.at(-1)?.id) ?? Array.from(assetUrls.values()).at(-1),
  };
}

async function pollProviderUntilDone(adapter, requestId, secrets) {
  const timeoutMs = Number(process.env.ZAP_CLI_POLL_TIMEOUT_MS ?? 20 * 60 * 1000);
  const intervalMs = Number(process.env.ZAP_CLI_POLL_INTERVAL_MS ?? 5000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await adapter.poll(requestId, secrets);
    if (result.status === "done") return result;
    if (result.status === "failed") throw new Error(result.error ?? `${adapter.id} request ${requestId} failed.`);
    await sleep(intervalMs);
  }
  throw new Error(`${adapter.id} request ${requestId} did not finish before timeout.`);
}

async function persistCliAsset(url, dir, stepId) {
  await fs.mkdir(dir, { recursive: true });
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:")) return url;
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return url;
    const extension = match[1].split("/").at(1)?.split("+").at(0) ?? "bin";
    const target = path.join(dir, `${stepId}.${extension}`);
    await fs.writeFile(target, Buffer.from(match[2], "base64"));
    return target;
  }
  const response = await fetch(url);
  if (!response.ok) return url;
  const extension = extensionFromUrl(url);
  const target = path.join(dir, `${stepId}.${extension}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

function plannedStep(spec, step) {
  const provider = isLocalStep(step) ? "local" : step.provider ?? spec.defaults?.provider ?? "fal";
  const model = isLocalStep(step) ? step.model ?? "local" : step.model ?? spec.defaults?.models?.[step.kind] ?? defaultModelFor(provider, step.kind);
  return {
    kind: step.kind,
    model,
    provider,
    quoteUsd: isLocalStep(step) ? 0 : quoteStep(spec, step),
    status: "planned",
    stepId: step.id,
  };
}

function resolveStepInputUrls(step, inputs, assetUrls) {
  const refs = [...(step.inputs ?? []), ...(step.reference_images ?? [])];
  const urls = [];
  for (const ref of refs) {
    if (ref.endsWith(".*")) {
      const prefix = ref.slice(0, -2);
      urls.push(...Array.from(assetUrls.entries()).filter(([stepId]) => stepId === prefix || stepId.startsWith(`${prefix}_`)).map(([, url]) => url));
      continue;
    }
    if (ref.startsWith("user.")) {
      const value = inputs[ref.slice("user.".length)];
      if (typeof value === "string") urls.push(value);
      continue;
    }
    const asset = assetUrls.get(ref);
    if (asset) urls.push(asset);
    else if (typeof inputs[ref] === "string") urls.push(inputs[ref]);
  }
  if (urls.length === 0 && typeof inputs.image === "string") urls.push(inputs.image);
  return Array.from(new Set(urls.filter(Boolean)));
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

async function galleryCommand(args, flags) {
  const auth = await readAuthStore();
  const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  if (flags.remote) {
    const response = await fetch(`${apiBase}/api/zaps`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Gallery request failed with ${response.status}.`);
    if (flags.json) printJson(payload);
    else (payload.zaps ?? []).forEach((zap) => console.log(`${registrySlug(zap)} ${zap.title ?? ""} $${Number(zap.budget?.estimate_usd ?? 0).toFixed(2)}`));
    return;
  }

  const files = await resolveZapFiles(args);
  const zaps = [];
  for (const file of files) {
    const spec = await parseZapFile(file);
    zaps.push({
      estimateUsd: spec.budget.estimate_usd,
      file,
      slug: spec.zap,
      steps: spec.steps.length,
      title: titleize(spec.zap),
    });
  }
  if (flags.json) printJson({ zaps });
  else zaps.forEach((zap) => console.log(`${zap.slug} ${zap.steps} step(s) $${zap.estimateUsd.toFixed(2)} ${zap.file}`));
}

async function searchCommand(args, flags) {
  const query = args.join(" ").trim();
  if (!query) throw new Error("Usage: zap search <query> [--remote] [--json]");
  const auth = await readAuthStore();
  const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  let zaps;
  let source;

  if (flags.remote) {
    const url = new URL(`${apiBase}/api/zaps`);
    url.searchParams.set("query", query);
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Zap search failed with ${response.status}.`);
    zaps = payload.zaps ?? [];
    source = "remote";
  } else {
    const indexPath = path.join(findResourceRoot(), "registry", "zaps", "index.json");
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    zaps = searchRegistryEntries(index.zaps ?? [], query);
    source = "local";
  }

  if (flags.json) printJson({ query, source, zaps });
  else zaps.forEach((zap) => console.log(`${registrySkillName(zap)} ${zap.title ?? ""} $${Number(zap.budget?.estimate_usd ?? 0).toFixed(2)}`));
}

function searchRegistryEntries(zaps, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return zaps.filter((zap) => {
    const haystack = JSON.stringify(zap).toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function registrySlug(zap) {
  return zap.slug ?? zap.zap ?? "unknown";
}

function registrySkillName(zap) {
  const slug = registrySlug(zap);
  return slug.startsWith("zap-") ? slug : `zap-${slug}`;
}

async function finalizeCommand(args, flags) {
  const slug = args[0] ?? flags.slug;
  if (!slug) throw new Error("Usage: zap finalize <slug> [--token ...] [--api-url ...]");
  const auth = await readAuthStore();
  const token = String(flags.token ?? auth.token ?? process.env.ZAP_TOKEN ?? "");
  if (!token) throw new Error("zap finalize requires `zap login --token ...`, --token, or ZAP_TOKEN.");
  const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  const body = {
    finalizedBy: flags.finalizedBy,
    heroAssetUrl: flags.heroAssetUrl,
    tags: parseCsvFlag(flags.tags),
    title: flags.title,
  };
  const response = await fetch(`${apiBase}/api/zaps/${encodeURIComponent(slug)}/finalize`, {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Finalize failed with ${response.status}.`);
  if (flags.json) printJson(payload);
  else console.log(`Finalized ${payload.slug ?? slug} on ${apiBase}`);
}

async function importCommand(args, flags) {
  assertZapProject(process.cwd());
  const source = args[0] ?? flags.from;
  if (source === "hyperframes") return importHyperframes(flags);
  if (source === "openmontage") return importOpenMontage(flags);
  throw new Error("Usage: zap import <hyperframes|openmontage> [--source path] [--limit n] [--force]");
}

async function importHyperframes(flags) {
  const registryFile = path.resolve(process.cwd(), String(flags.source ?? "../hyperframes-main/registry/registry.json"));
  const registry = JSON.parse(await fs.readFile(registryFile, "utf8"));
  await ensureDesignBrief();
  const names = parseCsvFlag(flags.name);
  const limit = Number(flags.limit ?? 12);
  const items = (registry.items ?? [])
    .filter((item) => names.length === 0 || names.includes(item.name))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);
  const imported = [];
  for (const item of items) {
    const slug = `hf-${slugify(item.name)}`;
    const skillDir = await writeImportedZap({
      description: `HyperFrames ${item.name} template packaged as a Zap recipe.`,
      metadata: { source: "hyperframes", template: item.name, type: item.type },
      prompts: {
        "prompts/initial-frame.md": `Create a strong visual frame for {PROMPT} that fits the HyperFrames template "${item.name}".\n`,
        "prompts/initial-gen.md": `Animate the frame into a short polished video for {PROMPT}. Preserve the visual grammar of "${item.name}".\n`,
      },
      slug,
      stitch: { engine: "hyperframes", format: "mp4", inputs: { template: item.name }, quality: "standard", template: item.name },
      title: `HyperFrames ${titleize(item.name)}`,
    }, flags);
    imported.push({ skillDir, slug, template: item.name });
  }
  if (flags.json) printJson({ imported, registryFile });
  else imported.forEach((entry) => console.log(`Imported ${entry.template} -> zap-${entry.slug}`));
}

async function ensureDesignBrief() {
  await writeNewFile(path.join(process.cwd(), "DESIGN.md"), [
    "# Zap Design Brief",
    "",
    "- Use the imported HyperFrames template as the motion/layout reference.",
    "- Keep typography high-contrast, legible, and aligned to the recipe prompt.",
    "- Avoid decorative filler that hides generated media or text.",
    "",
  ].join("\n"));
}

async function importOpenMontage(flags) {
  const pipelinesDir = path.resolve(process.cwd(), String(flags.source ?? "../OpenMontage-main/pipeline_defs"));
  const names = parseCsvFlag(flags.name);
  const files = (await fs.readdir(pipelinesDir))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .filter((file) => names.length === 0 || names.includes(file.replace(/\.ya?ml$/, "")))
    .sort();
  const limit = Number(flags.limit ?? files.length);
  const imported = [];
  for (const fileName of files.slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined)) {
    const file = path.join(pipelinesDir, fileName);
    const pipeline = parseDocument(await fs.readFile(file, "utf8")).toJS() ?? {};
    const name = String(pipeline.name ?? fileName.replace(/\.ya?ml$/, ""));
    const slug = `om-${slugify(name)}`;
    const stageNames = Array.isArray(pipeline.stages) ? pipeline.stages.map((stage) => stage?.name).filter(Boolean) : [];
    const skillDir = await writeImportedZap({
      description: String(pipeline.description ?? `OpenMontage ${name} pipeline packaged as a Zap recipe.`).replace(/\s+/g, " ").trim(),
      metadata: {
        category: pipeline.category,
        source: "openmontage",
        stability: pipeline.stability,
        stages: stageNames,
      },
      prompts: {
        "prompts/initial-frame.md": `Create a reference frame for an OpenMontage ${name} production: {PROMPT}\n`,
        "prompts/initial-gen.md": `Generate a short ${name} sequence from the approved frame: {PROMPT}\n`,
      },
      slug,
      stitch: { engine: "auto", format: "mp4", inputs: { pipeline: name, stages: stageNames }, quality: "standard", template: `openmontage:${name}` },
      title: `OpenMontage ${titleize(name)}`,
    }, flags);
    imported.push({ pipeline: name, skillDir, slug });
  }
  if (flags.json) printJson({ imported, pipelinesDir });
  else imported.forEach((entry) => console.log(`Imported ${entry.pipeline} -> zap-${entry.slug}`));
}

async function writeImportedZap({ description, metadata, prompts, slug, stitch, title }, flags) {
  const skillDir = path.join(process.cwd(), "agent", "skills", `zap-${slug}`);
  await fs.mkdir(path.join(skillDir, "prompts"), { recursive: true });
  const zapMd = [
    "---",
    stringify({
      budget: { cap_usd: 5, estimate_usd: 0.25 },
      defaults: {
        models: {
          "image.gen": "fal-ai/flux/dev",
          "video.gen": "fal-ai/kling-video/v2.1/pro/image-to-video",
        },
        provider: "fal",
      },
      description,
      inputs: {
        PROMPT: {
          hint: "Describe the piece to produce.",
          label: "Prompt",
          required: true,
          type: "textarea",
        },
      },
      output: "Zap.mp4",
      publish: { slug, visibility: "public" },
      steps: [
        {
          id: "initial_frame",
          kind: "image.gen",
          model: "fal-ai/flux/dev",
          prompt: "prompts/initial-frame.md",
          provider: "fal",
        },
        {
          duration_s: 8,
          id: "initial_gen",
          inputs: ["initial_frame"],
          kind: "video.gen",
          model: "fal-ai/kling-video/v2.1/pro/image-to-video",
          prompt: "prompts/initial-gen.md",
          provider: "fal",
        },
        {
          id: "stitch",
          inputs: ["initial_gen"],
          kind: "stitch",
          stitch,
        },
      ],
      version: 2,
      x_source: metadata,
      zap: slug,
    }).trim(),
    "---",
    "",
    `# ${title}`,
    "",
  ].join("\n");
  await writeRecipeFile(path.join(skillDir, "SKILL.md"), `# zap-${slug}\n\nUse this skill when a creator wants ${title}.\n`, flags.force);
  await writeRecipeFile(path.join(skillDir, "Zap.md"), zapMd, flags.force);
  for (const [promptPath, content] of Object.entries(prompts)) {
    await writeRecipeFile(path.join(skillDir, promptPath), content, flags.force);
  }
  return skillDir;
}

async function mcpCommand(flags) {
  const tools = [
    "zap_validate",
    "zap_lint",
    "zap_run",
    "zap_status",
    "zap_keys_list",
    "zap_gallery_list",
    "zap_deploy",
    "zap_import_hyperframes",
    "zap_import_openmontage",
    "zap_docs",
  ];
  if (flags.json) {
    printJson({
      package: "@wzrdtech/zap-mcp",
      command: "zap mcp",
      tools,
      transport: "stdio",
    });
    return;
  }
  process.env.ZAP_CLI_BIN ??= fileURLToPath(new URL("../bin/zap.js", import.meta.url));
  const { startZapMcpServer } = await import("@wzrdtech/zap-mcp/server");
  await startZapMcpServer();
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

async function embedCommand(args, flags) {
  const slug = args[0] ?? flags.slug;
  if (!slug) throw new Error("Usage: zap embed <slug> [--base-url https://zap.wzrd.tech] [--json]");
  const baseUrl = String(flags.baseUrl ?? process.env.ZAP_PUBLIC_ORIGIN ?? process.env.ZAP_PUBLIC_BASE_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  const iframe = `<iframe src="${baseUrl}/embed/${slug}" width="1280" height="720" loading="lazy" allow="clipboard-write; fullscreen"></iframe>`;
  const oembed = `${baseUrl}/api/oembed?url=${encodeURIComponent(`${baseUrl}/${slug}`)}`;
  if (flags.json) printJson({ iframe, oembed, slug });
  else console.log(iframe);
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

async function inspectCommand(args, flags) {
  const file = (await resolveZapFiles(args))[0];
  if (!file) throw new Error("Usage: zap inspect <slug|Zap.md> [--json]");
  const spec = await parseZapFile(file);
  const extendCount = Number(flags.extend ?? spec.steps.find((step) => step.kind === "video.extend")?.repeat?.default ?? 0);
  const steps = expandSteps(spec, extendCount);
  const result = {
    budget: spec.budget,
    defaults: spec.defaults,
    file,
    publish: spec.publish,
    quoteUsd: estimateUsd(spec, steps),
    steps: steps.map((step) => plannedStep(spec, step)),
    version: spec.version,
    zap: spec.zap,
  };
  if (flags.json) printJson(result);
  else {
    console.log(`${result.zap} v${result.version} quote $${result.quoteUsd.toFixed(2)}`);
    result.steps.forEach((step) => console.log(`${step.stepId} ${step.provider}/${step.model} ${step.kind} $${step.quoteUsd.toFixed(2)}`));
  }
}

async function keysCommand(args, flags) {
  const subcommand = args[0] ?? "list";
  if (subcommand === "add") return keysAdd(args.slice(1), flags);
  if (subcommand === "list") return keysList(flags);
  if (subcommand === "remove") return keysRemove(args.slice(1), flags);
  if (subcommand === "test") return keysTest(args.slice(1), flags);
  if (subcommand === "sync") return keysSync(flags);
  throw new Error("Usage: zap keys [add|list|test|remove|sync] [--json]");
}

async function keysAdd(args, flags) {
  const provider = args[0] ?? flags.provider;
  if (!provider) throw new Error("Usage: zap keys add <provider> <secretType> <value>");
  const adapter = getProviderAdapter(provider);
  const secretType = String(flags.type ?? args[1] ?? adapter.secretTypes[0]);
  if (!adapter.secretTypes.includes(secretType)) {
    throw new Error(`${secretType} is not valid for ${provider}. Expected ${adapter.secretTypes.join(", ")}.`);
  }
  const value = String(flags.value ?? args[2] ?? process.env[secretType.toUpperCase()] ?? "");
  if (!value) throw new Error(`Secret value required for ${secretType}. Use --value or pass it as an argument.`);
  const store = await readCredentialStore();
  store.secrets[secretType] = {
    ...encryptValue(value),
    last4: value.slice(-4),
    provider,
    secretType,
    updatedAt: new Date().toISOString(),
  };
  await writeCredentialStore(store);
  const result = { ok: true, provider, secretType, last4: value.slice(-4) };
  if (flags.json) printJson(result);
  else console.log(`Saved ${provider}/${secretType} ****${value.slice(-4)}`);
}

async function keysList(flags) {
  const store = await readCredentialStore();
  const secrets = Object.values(store.secrets).map((entry) => ({
    last4: entry.last4,
    provider: entry.provider,
    secretType: entry.secretType,
    updatedAt: entry.updatedAt,
  }));
  if (flags.json) printJson({ secrets });
  else secrets.forEach((secret) => console.log(`${secret.provider}/${secret.secretType} ****${secret.last4}`));
}

async function keysRemove(args, flags) {
  const secretType = String(flags.type ?? args.at(-1) ?? "");
  if (!secretType) throw new Error("Usage: zap keys remove <secretType>");
  const store = await readCredentialStore();
  delete store.secrets[secretType];
  await writeCredentialStore(store);
  if (flags.json) printJson({ ok: true, secretType });
  else console.log(`Removed ${secretType}`);
}

async function keysTest(args, flags) {
  const provider = args[0] ?? flags.provider;
  const providers = provider ? [provider] : supportedProviderIds();
  const credentials = await readCredentialStore();
  const results = [];
  for (const id of providers) {
    const adapter = getProviderAdapter(id);
    results.push(await adapter.validateKey(secretsForProvider(credentials, id)));
  }
  if (flags.json) printJson({ results });
  else results.forEach((result) => console.log(`${result.ok ? "ok" : "fail"} ${result.provider}${result.error ? `: ${result.error}` : ""}`));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

async function keysSync(flags) {
  const auth = await readAuthStore();
  const token = String(flags.token ?? auth.token ?? process.env.ZAP_TOKEN ?? "");
  if (!token) throw new Error("zap keys sync requires `zap login --token ...` or ZAP_TOKEN.");
  const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  const credentials = await readCredentialStore();
  const synced = [];
  for (const [secretType, entry] of Object.entries(credentials.secrets)) {
    const response = await fetch(`${apiBase}/api/secrets`, {
      body: JSON.stringify({ secretType, value: decryptValue(entry) }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      method: "PUT",
    });
    if (!response.ok) throw new Error(`Sync failed for ${secretType}: ${await response.text()}`);
    synced.push(secretType);
  }
  if (flags.json) printJson({ ok: true, synced });
  else console.log(`Synced ${synced.length} secret(s) to ${apiBase}`);
}

async function loginCommand(flags) {
  const token = String(flags.token ?? process.env.ZAP_TOKEN ?? "");
  if (!token) throw new Error("Usage: zap login --token <token> [--api-url https://zap.wzrd.tech]");
  const apiUrl = String(flags.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  await writeAuthStore({ apiUrl, token });
  if (flags.json) printJson({ apiUrl, ok: true });
  else console.log(`Logged in to ${apiUrl}`);
}

async function logoutCommand(flags) {
  const file = path.join(await zapConfigDir(), "auth.json");
  if (existsSync(file)) await fs.rm(file, { force: true });
  if (flags.json) printJson({ ok: true });
  else console.log("Logged out.");
}

async function deployCommand(args, flags) {
  const file = (await resolveZapFiles(args))[0];
  if (!file) throw new Error("Usage: zap deploy <slug|Zap.md> [--finalize] [--json]");
  const spec = await parseZapFile(file);
  const auth = await readAuthStore();
  const token = String(flags.token ?? auth.token ?? process.env.ZAP_TOKEN ?? "");
  const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  const body = await bundleZapSource(file, spec);
  body.finalize = Boolean(flags.finalize);
  body.status = flags.finalize ? "published" : "draft";
  if (!token) {
    const dir = path.join(process.cwd(), ".zap", "deployments");
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${spec.zap}.json`);
    await fs.writeFile(target, JSON.stringify(body, null, 2) + "\n");
    if (flags.json) printJson({ file: target, ok: true, offline: true, slug: spec.zap });
    else console.log(`Prepared offline ${body.status} deployment ${target}`);
    return;
  }
  const response = await fetch(`${apiBase}/api/zaps/publish`, {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Deploy failed with ${response.status}.`);
  if (flags.json) printJson(payload);
  else console.log(`${payload.status === "published" ? "Finalized" : "Deployed draft"} ${payload.slug ?? spec.zap} at ${apiBase}/${payload.slug ?? spec.zap}`);
}

async function upgradeCommand(flags) {
  const message = "Upgrade checks are local in v0.2. Reinstall @wzrdtech/zap or run npm update @wzrdtech/zap to upgrade.";
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

async function bundleZapSource(file, spec) {
  const zapMd = await fs.readFile(file, "utf8");
  const prompts = {};
  await Promise.all((spec.steps ?? []).map(async (step) => {
    if (!step.prompt || !(step.prompt.endsWith(".md") || step.prompt.startsWith("prompts/"))) return;
    prompts[step.prompt] = await readPromptFile(file, step.prompt);
  }));
  return {
    estimateUsd: spec.budget.estimate_usd,
    prompts,
    slug: spec.publish?.slug ?? spec.zap,
    source: { prompts, zapMd },
    tags: [],
    version: spec.version,
    zapMd,
  };
}

async function zapConfigDir() {
  const projectDir = path.join(process.cwd(), ".zap");
  if (existsSync(path.join(process.cwd(), "package.json"))) {
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }
  const homeDir = path.join(os.homedir(), ".zap");
  await fs.mkdir(homeDir, { recursive: true });
  return homeDir;
}

async function readCredentialStore() {
  const file = path.join(await zapConfigDir(), "credentials.json");
  if (!existsSync(file)) return { secrets: {}, version: 1 };
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  return { secrets: parsed.secrets ?? {}, version: parsed.version ?? 1 };
}

async function writeCredentialStore(store) {
  const dir = await zapConfigDir();
  const file = path.join(dir, "credentials.json");
  await fs.writeFile(file, JSON.stringify({ secrets: store.secrets ?? {}, version: 1 }, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

async function readAuthStore() {
  const file = path.join(await zapConfigDir(), "auth.json");
  if (!existsSync(file)) return {};
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeAuthStore(auth) {
  const file = path.join(await zapConfigDir(), "auth.json");
  await fs.writeFile(file, JSON.stringify(auth, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

function encryptValue(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", localEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptValue(entry) {
  const decipher = createDecipheriv("aes-256-gcm", localEncryptionKey(), Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function localEncryptionKey() {
  return scryptSync(`${os.userInfo().username}:${os.hostname()}`, "zap-cli-credentials-v1", 32);
}

function secretsForProvider(store, provider) {
  const adapter = getProviderAdapter(provider);
  const secrets = {};
  for (const secretType of adapter.secretTypes) {
    const entry = store.secrets[secretType];
    if (entry) secrets[secretType] = decryptValue(entry);
  }
  return secrets;
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

function parseCsvFlag(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item).split(",").map((entry) => entry.trim()).filter(Boolean));
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
  const spec = parseZapMarkdown(content);
  validateZapPromptTemplates(spec, await readPromptContents(file, spec));
  return spec;
}

function validateSpec(spec) {
  for (const step of spec.steps) {
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

function withPlanInputDefaults(spec, inputs, live) {
  if (live) return inputs;
  const next = { ...inputs };
  for (const [name, input] of Object.entries(spec.inputs ?? {})) {
    if (input.required && next[name] === undefined) {
      next[name] = input.type === "image" ? `https://example.com/${name}.png` : `example-${name.toLowerCase()}`;
    }
  }
  return next;
}

function lintSpec(spec) {
  const warnings = [];
  const providers = supportedProviderIds();
  if (!providers.includes(spec.defaults?.provider)) {
    warnings.push(`defaults.provider must be one of ${providers.join(", ")}.`);
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

function quoteStep(spec, step) {
  if (step.kind === "stitch" || step.kind === "keyframes") return 0;
  const provider = step.provider ?? spec.defaults?.provider ?? "fal";
  const model = step.model ?? spec.defaults?.models?.[step.kind] ?? defaultModelFor(provider, step.kind);
  const rates = getProviderAdapter(provider);
  try {
    return rates.price({
      capability: step.kind,
      durationS: step.duration_s,
      inputs: {},
      model,
      prompt: "",
      provider,
      runId: "quote",
      stepId: step.id,
    });
  } catch {
    return 0;
  }
}

function estimateUsd(spec, steps) {
  return steps.reduce((sum, step) => sum + quoteStep(spec, step), 0);
}

async function readPromptContents(file, spec) {
  const entries = {};
  await Promise.all((spec.steps ?? []).map(async (step) => {
    if (!step.prompt || !(step.prompt.endsWith(".md") || step.prompt.startsWith("prompts/"))) return;
    entries[step.prompt] = await readPromptFile(file, step.prompt);
  }));
  return entries;
}

async function readPromptFile(zapFile, promptPath) {
  if (!promptPath) return "";
  if (!(promptPath.endsWith(".md") || promptPath.startsWith("prompts/"))) return promptPath;
  return fs.readFile(path.join(path.dirname(zapFile), promptPath), "utf8");
}

function interpolate(template, inputs) {
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, name) => String(inputs[name] ?? ""));
}

function extensionFromUrl(url) {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).replace(/^\./, "");
  return extension || "bin";
}

function isLocalStep(step) {
  return step.kind === "stitch" || step.kind === "keyframes";
}

function supportedProviderIds() {
  return listProviderAdapters().map((adapter) => adapter.id).sort();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    recommendations.push("Document why this recipe intentionally defaults to a specific live provider, or switch defaults.provider to the cheapest supported provider.");
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
  run <Zap.md>        Plan a Zap by default; use --live to submit providers
  status [runId]      Show local run status
  gallery             List local recipes; add --remote for hosted gallery
  search <query>      Search registry templates; add --remote for hosted search
  keys                Manage encrypted BYOK provider keys
  login/logout        Store or remove a Zap API token
  deploy <Zap.md>     Upload a draft Zap to the hosted API
  finalize <slug>     Finalize a deployed draft into the gallery
  import <source>     Import hyperframes or openmontage templates
  inspect <Zap.md>    Show provider/model plan details
  embed <slug>        Print iframe/oEmbed embed snippets
  mcp                 Start the Zap MCP stdio server
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
  --budget-cap-usd N  Override the recipe spend cap for this run
  --force             Overwrite generated recipe files
  --version           Print version

Install / invoke (Node 24.x):
  npx --yes @wzrdtech/zap@${version} <command>
  npm exec -- zap <command>              # project-local install
  npm install --global @wzrdtech/zap@${version}  # enables the bare zap command
`);
}
