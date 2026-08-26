// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZapCliError, usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";

/**
 * Scaffolds `agents/<id>/` from `packages/agent-code/templates/agent/` and
 * registers the agent in `project.ts`. Ships no `.env` — outbound auth is a
 * connection plus `zap secret set`.
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
export async function agentNew(ctx) {
  const id = ctx.args[0];
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw usageError("Usage: zap agent new <id> (lowercase letters, digits, dashes)");
  }
  const dir = path.join(ctx.cwd, "agents", id);
  const exists = await fs
    .access(path.join(dir, "agent.ts"))
    .then(() => true)
    .catch(() => false);
  if (exists) {
    throw new ZapCliError({ code: "AGENT_EXISTS", message: `agents/${id}/agent.ts already exists.` });
  }
  const agentEntry = fileURLToPath(import.meta.resolve("@wzrdtech/zap-agent"));
  const packageDir = path.dirname(path.dirname(agentEntry));
  const templateDir = path.join(packageDir, "templates", "agent");
  await fs.mkdir(dir, { recursive: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of await fs.readdir(templateDir)) {
    const body = await fs.readFile(path.join(templateDir, entry), "utf8");
    const target = path.join(dir, entry);
    await fs.writeFile(target, body.replaceAll("__AGENT_ID__", id));
    files.push(path.relative(ctx.cwd, target));
  }
  const registered = await registerInProject(ctx.cwd, id);
  if (registered) files.push("project.ts");
  if (ctx.flags.json) printJson({ agent: id, files, ok: true });
  else console.log(`Scaffolded agents/${id}. Render it with zap agent render --agent ${id} --input "..."`);
}

/**
 * @param {string} cwd
 * @param {string} id
 */
async function registerInProject(cwd, id) {
  const file = path.join(cwd, "project.ts");
  const entry = `${JSON.stringify(id)}: () => import(${JSON.stringify(`./agents/${id}/agent`)})`;
  let source = "";
  try {
    source = await fs.readFile(file, "utf8");
  } catch {
    await fs.writeFile(
      file,
      `import { defineProject } from "@wzrdtech/zap-agent";\nexport default defineProject({ agents: { ${entry} } });\n`,
    );
    return true;
  }
  if (source.includes(`./agents/${id}/agent`)) return false;
  const marker = "agents: {";
  const at = source.indexOf(marker);
  if (at === -1) {
    throw new ZapCliError({
      code: "PROJECT_UNREGISTERED",
      message: `project.ts has no agents map; add ${entry} yourself.`,
    });
  }
  const insertAt = at + marker.length;
  const rest = source.slice(insertAt).trimStart();
  const separator = rest.startsWith("}") ? " " : " ";
  const suffix = rest.startsWith("}") ? " " : ", ";
  await fs.writeFile(file, `${source.slice(0, insertAt)}${separator}${entry}${suffix}${source.slice(insertAt).trimStart()}`);
  return true;
}
