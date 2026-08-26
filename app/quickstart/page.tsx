import Link from "next/link";
import { ArrowUpRight, Bot, CheckCircle2, FileText, TerminalSquare } from "lucide-react";
import { CodeWindow, Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";
import { ZAP_VERSION } from "@/lib/zap-version";

const agents = ["Claude Code", "Cursor", "Codex", "Devin", "OpenClaw", "Hermes", "Pi"];

const safeFirstRun = `npx @wzrdtech/zap@${ZAP_VERSION} doctor --json
npx @wzrdtech/zap@${ZAP_VERSION} init my-zap --non-interactive --json
cd my-zap
npx @wzrdtech/zap@${ZAP_VERSION} compose --weight med --sandbox box --dry-run --json`;

const mcpCommand = `npx -y @wzrdtech/zap@${ZAP_VERSION} mcp`;

export default function QuickstartPage() {
  return (
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />

        <header className="mt-12 grid gap-8 border-white/10 border-b pb-10 lg:grid-cols-[1fr_500px] lg:items-end">
          <div>
            <Eyebrow>
              <Bot className="size-4" />
              Use Zap from your agent
            </Eyebrow>
            <h1 className="mt-4 text-balance font-semibold text-5xl leading-none text-white sm:text-6xl">
              Point your agent at Zap.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty leading-7 text-white/62">
              One MCP command or one URL. Every CLI command supports --json. The first-run sequence
              below plans everything and executes nothing live: no sandbox is acquired and no
              provider is called.
            </p>
          </div>
          <CodeWindow label="safe first run — plan only" status="no live work">
            {safeFirstRun}
          </CodeWindow>
        </header>

        <section className="grid gap-5 py-10 lg:grid-cols-[1fr_420px]">
          <div className="rounded-md border border-white/10 bg-black/25 p-5 md:p-7">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zap-ink text-zap-cyan">
                <TerminalSquare className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold text-2xl leading-tight text-white">Connect over MCP</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                  Add Zap as an MCP server in any MCP-capable coding agent. Plan-only stays the
                  default; live side effects require explicit intent and a configured payer.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <CodeWindow label="MCP — stdio" status="copy & connect">
                {mcpCommand}
              </CodeWindow>
            </div>

            <div className="mt-6 grid gap-3">
              <Endpoint label="Agent map (this site)" value="https://zap.wzrd.tech/llms.txt" />
              <Endpoint label="Full agent index" value={`${ZAP_DOCS_URL}/llms.txt`} />
              <Endpoint label="Per-client setup" value={`${ZAP_DOCS_URL}/agents/use-zap`} />
              <Endpoint label="Canonical docs" value={ZAP_DOCS_URL} />
            </div>

            <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-white/58">
              <FileText className="mt-1 size-4 shrink-0 text-zap-cyan" />
              Safety invariants: side-effecting tools are planned, never executed, without --live and
              a payer; a missing payer fails closed with PAYER_MISSING; agent secrets are write-only
              and scoped to declared HTTPS connections.
            </p>
          </div>

          <div className="grid content-start gap-5">
            <div className="rounded-md border border-white/10 bg-black/35 p-5 text-white">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-zap-cyan" />
                <h2 className="font-semibold text-xl">Works with</h2>
              </div>
              <div className="mt-5 grid gap-2">
                {agents.map((agent) => (
                  <div className="flex min-h-12 items-center justify-between rounded-md border border-white/10 bg-white/5 px-3" key={agent}>
                    <span className="font-medium text-sm">{agent}</span>
                    <span className="font-mono text-[11px] text-white/45">MCP</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-zap-amber/25 bg-zap-amber/5 p-5 text-white">
              <p className="font-mono text-xs tracking-[0.18em] text-zap-amber uppercase">Legacy 0.3.1</p>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Migrating from the 0.3.1 recipe framework? Recipes remain compatible on v5.
              </p>
              <Link
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-4 font-medium text-sm text-white transition hover:bg-white/10"
                href={`${ZAP_DOCS_URL}/legacy/introduction`}
                prefetch={false}
              >
                Legacy docs
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Endpoint({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 sm:grid-cols-[170px_1fr] sm:items-center">
      <span className="font-medium text-sm text-white/78">{label}</span>
      <span className="break-all font-mono text-xs text-zap-cyan">{value}</span>
    </div>
  );
}
