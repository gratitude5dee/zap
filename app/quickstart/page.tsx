import Link from "next/link";
import { Bot, CheckCircle2, TerminalSquare } from "lucide-react";

const agents = ["Codex", "Claude Code", "Cursor", "OpenClaw", "Hermes"];

export default function QuickstartPage() {
  return (
    <main className="min-h-dvh bg-[#f6f6f0] px-5 py-8 text-zinc-950 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link className="text-sm text-zinc-600" href="/">Zap</Link>
          <Link className="rounded-md border bg-white px-3 py-2 text-sm" href="/docs">Docs</Link>
        </div>
        <div className="mt-10 max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-sm text-teal-900">
            <Bot className="size-4" />
            Agent framework quickstart
          </p>
          <h1 className="font-semibold text-5xl tracking-normal">Point your agent at Zap.</h1>
          <p className="mt-4 text-zinc-600 leading-7">Use the project URL, repo, or bundled skills so coding agents can download the framework rules, create recipes, and validate mock runs before live provider spend.</p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <TerminalSquare className="mb-4 size-5 text-teal-800" />
            <h2 className="font-semibold text-xl">Install and validate</h2>
            <pre className="mt-4 overflow-x-auto rounded-md bg-zinc-950 p-4 text-sm text-zinc-100"><code>{`npx @zap-md/cli init my-zap-app
cd my-zap-app
npx @zap-md/cli new creator-intro
npx @zap-md/cli validate
npx @zap-md/cli run agent/skills/zap-creator-intro/Zap.md --json`}</code></pre>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <CheckCircle2 className="mb-4 size-5 text-amber-700" />
            <h2 className="font-semibold text-xl">Agent instruction</h2>
            <p className="mt-4 text-sm text-zinc-600 leading-6">Read `skills/zap/SKILL.md`, then use `skills/zap-authoring/SKILL.md` before editing any `Zap.md` recipe. Keep provider defaults mock unless the user approves live spend.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {agents.map((agent) => (
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm" key={agent}>{agent}</div>
          ))}
        </div>
      </div>
    </main>
  );
}
