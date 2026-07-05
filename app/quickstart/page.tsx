import { Bot, CheckCircle2, CopyCheck, TerminalSquare } from "lucide-react";
import { CodeWindow, Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";

const agents = ["Codex", "Claude Code", "Cursor", "OpenClaw", "Hermes"];

const install = `npx @wzrdtech/zap@0.2.0 init my-zap-app
cd my-zap-app
npx @wzrdtech/zap@0.2.0 new creator-intro
npx @wzrdtech/zap@0.2.0 validate
npx @wzrdtech/zap@0.2.0 run agent/skills/zap-creator-intro/Zap.md --json`;

export default function QuickstartPage() {
  return (
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />

        <header className="mt-12 grid gap-8 border-white/10 border-b pb-10 lg:grid-cols-[1fr_500px] lg:items-end">
          <div>
            <Eyebrow>
              <Bot className="size-4" />
              Agent framework quickstart
            </Eyebrow>
            <h1 className="mt-4 text-balance font-semibold text-5xl leading-none text-white sm:text-6xl">Point your agent at Zap.</h1>
            <p className="mt-5 max-w-3xl text-pretty leading-7 text-white/62">
              Give the agent a URL, repo, or bundled skill. It can fetch the framework rules, create recipes, validate the spec, and plan spend before any live call.
            </p>
          </div>
          <CodeWindow label="install" status="dry-run first">
            {install}
          </CodeWindow>
        </header>

        <section className="grid gap-5 py-10 lg:grid-cols-[1fr_420px]">
          <div className="rounded-md border border-white/10 bg-black/25 p-5 md:p-7">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zap-ink text-zap-cyan">
                <TerminalSquare className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold text-2xl leading-tight text-white">Agent instruction</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                  Read `skills/zap/SKILL.md`, then use `skills/zap-authoring/SKILL.md` before editing any `Zap.md` recipe. Keep runs plan-only unless the user approves live spend.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <Endpoint label="Manifest" value="https://zap.wzrd.tech/api/skills" />
              <Endpoint label="Core skill" value="https://zap.wzrd.tech/api/skills/zap" />
              <Endpoint label="Authoring skill" value="https://zap.wzrd.tech/api/skills/zap-authoring" />
              <Endpoint label="JSON mode" value="https://zap.wzrd.tech/api/skills/zap?format=json" />
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-black/35 p-5 text-white">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-zap-cyan" />
              <h2 className="font-semibold text-xl">Supported agent loops</h2>
            </div>
            <div className="mt-5 grid gap-2">
              {agents.map((agent) => (
                <div className="flex min-h-12 items-center justify-between rounded-md border border-white/10 bg-white/5 px-3" key={agent}>
                  <span className="font-medium text-sm">{agent}</span>
                  <CopyCheck className="size-4 text-white/50" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Endpoint({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 sm:grid-cols-[150px_1fr] sm:items-center">
      <span className="font-medium text-sm text-white/78">{label}</span>
      <span className="break-all font-mono text-xs text-zap-cyan">{value}</span>
    </div>
  );
}
