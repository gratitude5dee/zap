import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Braces } from "lucide-react";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";

export const dynamic = "force-static";

type Topic = {
  description: string;
  file: string;
  id: string;
  title: string;
};

const topics: Topic[] = [
  { description: "Start a project and run a zero-cost Zap plan.", file: "quickstart.md", id: "quickstart", title: "Quickstart" },
  { description: "Codex, Claude Code, Cursor, OpenClaw, Hermes, and skill download URLs.", file: "quickstart/agents.md", id: "agents", title: "Agent Quickstart" },
  { description: "Zap.md frontmatter fields and validation rules.", file: "zap-spec.md", id: "zap-spec", title: "Zap Spec" },
  { description: "Generation step kinds, dependencies, and HyperFrames stitch escape hatch.", file: "steps.md", id: "steps", title: "Steps" },
  { description: "GMI, fal, Prodia, Runware, and BYOK provider key behavior.", file: "providers.md", id: "providers", title: "Providers" },
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
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />

        <header className="mt-12 grid gap-8 border-white/10 border-b pb-10 lg:grid-cols-[1fr_360px]">
          <div>
            <Eyebrow>
              <BookOpen className="size-4" />
              Docs for humans and agents
            </Eyebrow>
            <h1 className="mt-4 text-balance font-semibold text-5xl leading-none text-white sm:text-6xl">Zap Docs</h1>
            <p className="mt-5 max-w-3xl text-pretty leading-7 text-white/62">
              The web docs and `zap docs` CLI topics share the same markdown source. Agents can read these topics offline, then validate each recipe with plan-only runs before live provider spend.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-black/25 p-5">
            <p className="font-mono text-xs text-white/45">quick command</p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-zap-ink p-4 text-[13px] leading-6 text-zinc-100"><code>{`zap docs zap-spec
zap docs agents
zap doctor --json`}</code></pre>
          </div>
        </header>

        <div className="grid gap-8 py-10 lg:grid-cols-[290px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-md border border-white/10 bg-black/25 p-3">
              <p className="mb-2 flex items-center gap-2 px-2 font-medium text-sm text-white">
                <Braces className="size-4 text-zap-blue" />
                Topics
              </p>
              <nav aria-label="Documentation topics" className="grid gap-1">
                {docs.map((topic) => (
                  <a className="rounded-md px-3 py-2 text-sm text-white/50 transition hover:bg-white/10 hover:text-white" href={`#${topic.id}`} key={topic.id}>
                    <span className="block font-medium text-white">{topic.title}</span>
                    <span className="mt-1 block text-xs leading-5">{topic.description}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="grid gap-5">
            {docs.map((topic) => (
              <section className="scroll-mt-8 rounded-md border border-white/10 bg-black/25 p-5 md:p-7" id={topic.id} key={topic.id}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-white/10 border-b pb-5">
                  <div>
                    <p className="font-mono text-xs text-white/45">zap docs {topic.id}</p>
                    <h2 className="mt-2 font-semibold text-3xl leading-tight text-white">{topic.title}</h2>
                  </div>
                  <Link className="inline-flex min-h-11 items-center rounded-md border border-white/10 px-3 font-medium text-sm text-white transition hover:bg-white/10" href="/api/skills/zap?format=json">Skill JSON</Link>
                </div>
                <article className="max-w-4xl text-white/62">{renderMarkdown(topic.content, topic.id)}</article>
              </section>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
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
        <pre className="my-5 overflow-x-auto rounded-md bg-zap-ink p-4 text-sm text-zinc-100" key={`${scope}-code-${index}`}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(<h4 className="mt-6 font-semibold text-xl text-white" key={`${scope}-h4-${index}`}>{line.slice(4)}</h4>);
      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(<h3 className="mt-8 font-semibold text-2xl text-white" key={`${scope}-h3-${index}`}>{line.slice(3)}</h3>);
      index += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(<h3 className="mt-2 font-semibold text-2xl text-white" key={`${scope}-h2-${index}`}>{line.slice(2)}</h3>);
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
      return <code className="rounded border border-white/10 bg-white/10 px-1 py-0.5 font-mono text-[0.9em] text-zap-cyan" key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
