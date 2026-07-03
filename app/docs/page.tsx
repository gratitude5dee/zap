import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Link from "next/link";

export const dynamic = "force-static";

type Topic = {
  description: string;
  file: string;
  id: string;
  title: string;
};

const topics: Topic[] = [
  { description: "Start a project and run a zero-cost mock Zap.", file: "quickstart.md", id: "quickstart", title: "Quickstart" },
  { description: "Codex, Claude Code, Cursor, OpenClaw, Hermes, and skill download URLs.", file: "quickstart/agents.md", id: "agents", title: "Agent Quickstart" },
  { description: "Zap.md frontmatter fields and validation rules.", file: "zap-spec.md", id: "zap-spec", title: "Zap Spec" },
  { description: "Generation step kinds, dependencies, and HyperFrames stitch escape hatch.", file: "steps.md", id: "steps", title: "Steps" },
  { description: "Mock, GMI, fal, and BYOK provider key behavior.", file: "providers.md", id: "providers", title: "Providers" },
  { description: "Estimate, cap, and live-run approval rules.", file: "budget.md", id: "budget", title: "Budget" },
  { description: "How coding agents should read, edit, and run Zap skills.", file: "agent.md", id: "agent", title: "Agent Framework" },
  { description: "Creator, gallery, studio, settings, and run-status surfaces.", file: "webapp.md", id: "webapp", title: "Web App" },
  { description: "Run, step, asset, feedback, cron, and poll state.", file: "convex.md", id: "convex", title: "Convex" },
  { description: "Production env, Supabase secrets, and rollout order.", file: "deploy.md", id: "deploy", title: "Deploy" },
  { description: "Common CLI, provider, Supabase, and HyperFrames failure cases.", file: "troubleshooting.md", id: "troubleshooting", title: "Troubleshooting" },
  { description: "Eve guide read order and pinned runtime assumptions.", file: "eve.md", id: "eve", title: "Eve" },
];

export default function DocsPage() {
  const docs = topics.map((topic) => ({
    ...topic,
    content: readDoc(topic.file),
  }));

  return (
    <main className="min-h-dvh bg-white px-5 py-8 text-zinc-950 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <Link className="text-sm text-zinc-600" href="/">Zap</Link>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/gallery">Gallery</Link>
        </div>

        <header className="mt-10 border-zinc-200 border-b pb-8">
          <p className="text-sm font-medium text-teal-800">Docs for humans and agents</p>
          <h1 className="mt-3 font-semibold text-5xl tracking-normal">Zap Docs</h1>
          <p className="mt-4 max-w-3xl text-zinc-600 leading-7">
            The web docs and `zap docs` CLI topics are backed by the same markdown source. Agents can read these topics offline, then validate every recipe with mock runs before touching live provider spend.
          </p>
        </header>

        <div className="grid gap-8 py-8 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav aria-label="Documentation topics" className="grid gap-2">
              {docs.map((topic) => (
                <a className="rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950" href={`#${topic.id}`} key={topic.id}>
                  <span className="block font-medium">{topic.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">{topic.description}</span>
                </a>
              ))}
            </nav>
          </aside>

          <div className="grid gap-12">
            {docs.map((topic) => (
              <section className="scroll-mt-8 border-zinc-200 border-b pb-10 last:border-b-0" id={topic.id} key={topic.id}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">zap docs {topic.id}</p>
                    <h2 className="mt-2 font-semibold text-3xl tracking-normal">{topic.title}</h2>
                  </div>
                  <Link className="rounded-md border px-3 py-2 text-sm" href={`/api/skills/zap?format=json`}>Skill JSON</Link>
                </div>
                <article className="max-w-4xl text-zinc-700">{renderMarkdown(topic.content, topic.id)}</article>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function readDoc(file: string) {
  const candidates = [
    path.join(process.cwd(), "docs", file),
    path.join(process.cwd(), "packages", "cli", "resources", "docs", file),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) return `# Missing Topic\n\nCould not find ${file}.`;
  return readFileSync(found, "utf8");
}

function renderMarkdown(content: string, scope: string) {
  const blocks: ReactNode[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push(
        <pre className="my-5 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100" key={`${scope}-code-${index}`}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(<h4 className="mt-6 font-semibold text-xl text-zinc-950" key={`${scope}-h4-${index}`}>{line.slice(4)}</h4>);
      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(<h3 className="mt-8 font-semibold text-2xl text-zinc-950" key={`${scope}-h3-${index}`}>{line.slice(3)}</h3>);
      index += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(<h3 className="mt-2 font-semibold text-2xl text-zinc-950" key={`${scope}-h2-${index}`}>{line.slice(2)}</h3>);
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push(
        <ul className="my-4 grid gap-2 pl-5 text-sm leading-6" key={`${scope}-ul-${index}`}>
          {items.map((item) => <li className="list-disc" key={item}>{renderInline(item)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\. /, ""));
        index += 1;
      }
      blocks.push(
        <ol className="my-4 grid gap-2 pl-5 text-sm leading-6" key={`${scope}-ol-${index}`}>
          {items.map((item) => <li className="list-decimal" key={item}>{renderInline(item)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !lines[index].startsWith("#") &&
      !lines[index].startsWith("- ") &&
      !/^\d+\. /.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p className="my-4 text-sm leading-7" key={`${scope}-p-${index}`}>{renderInline(paragraph.join(" "))}</p>);
  }

  return blocks;
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em] text-zinc-950" key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
