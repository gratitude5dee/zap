import Link from "next/link";
import { BookOpen, Code2, Database, TerminalSquare } from "lucide-react";

const sections = [
  {
    href: "/quickstart",
    icon: <BookOpen className="size-5" />,
    title: "Agent Quickstart",
    text: "Instructions for Codex, Claude Code, Cursor, OpenClaw, Hermes, and file-first agents.",
  },
  {
    href: "/docs#cli",
    icon: <TerminalSquare className="size-5" />,
    title: "CLI",
    text: "Use init, new, validate, lint, run, status, docs, skills, and doctor.",
  },
  {
    href: "/docs#schema",
    icon: <Code2 className="size-5" />,
    title: "Schema",
    text: "Author Zap.md with inputs, budgets, provider steps, repeats, and optional HyperFrames stitch settings.",
  },
  {
    href: "/docs#runtime",
    icon: <Database className="size-5" />,
    title: "Runtime",
    text: "Convex stores runs, Upstash queues provider polling, and Supabase stores user-owned secrets.",
  },
];

export default function DocsPage() {
  return (
    <main className="min-h-dvh bg-white px-5 py-8 text-zinc-950 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link className="text-sm text-zinc-600" href="/">Zap</Link>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/gallery">Gallery</Link>
        </div>
        <h1 className="mt-10 font-semibold text-5xl tracking-normal">Docs</h1>
        <p className="mt-4 max-w-2xl text-zinc-600 leading-7">Everything in Zap is designed to be readable by humans and coding agents: recipes, prompts, skills, docs, and runtime contracts live in files.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Link className="rounded-lg border border-zinc-200 p-5 hover:border-zinc-400" href={section.href} key={section.title}>
              <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-teal-50 text-teal-800">{section.icon}</div>
              <h2 className="font-semibold text-xl">{section.title}</h2>
              <p className="mt-2 text-sm text-zinc-600 leading-6">{section.text}</p>
            </Link>
          ))}
        </div>

        <section className="mt-12 border-zinc-200 border-t pt-8" id="cli">
          <h2 className="font-semibold text-2xl">CLI</h2>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100"><code>{`npx @zap-md/cli init my-zap-app
npx @zap-md/cli new launch-trailer
npx @zap-md/cli validate
npx @zap-md/cli run agent/skills/zap-launch-trailer/Zap.md --json`}</code></pre>
        </section>

        <section className="mt-10 border-zinc-200 border-t pt-8" id="schema">
          <h2 className="font-semibold text-2xl">Recipe Contract</h2>
          <p className="mt-3 text-sm text-zinc-600 leading-6">A Zap recipe declares inputs, budget, provider defaults, ordered generation steps, optional repeats, and a final output. Prompt files stay beside the recipe.</p>
        </section>

        <section className="mt-10 border-zinc-200 border-t pt-8" id="runtime">
          <h2 className="font-semibold text-2xl">Runtime Contract</h2>
          <p className="mt-3 text-sm text-zinc-600 leading-6">Mock mode is default. Live runs require explicit approval, provider keys, budget checks, and durable provider polling through Upstash and Convex.</p>
        </section>
      </div>
    </main>
  );
}
