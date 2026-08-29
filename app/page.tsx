import Image from "next/image";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Braces,
  Cpu,
  History,
  KeyRound,
  Plug,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { CodeWindow, Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { CopyCommandCta } from "@/app/_components/threeui/copy-command-cta";
import { CrtBackground } from "@/app/_components/threeui/crt-background";
import { GlassCta } from "@/app/_components/threeui/glass-cta";
import { FEATURED_PROVIDERS, PROVIDER_COUNT, ProviderCard } from "@/app/_components/provider-catalog";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";
import { ZAP_VERSION } from "@/lib/zap-version";

const doctorCommand = `npx @wzrdtech/zap@${ZAP_VERSION} doctor --json`;

const executionTrace = `Runtime.md resolved                         med · sandbox: box
Zap sandbox acquisition                     planned
sandbox.exec ffmpeg -i takes.mov …          planned
Provider cost                               quoted — $0.42, cap $1.50
Live execution                              waiting for explicit approval`;

const mcpCommand = `npx -y @wzrdtech/zap@${ZAP_VERSION} mcp`;

const profiles = [
  {
    name: "light",
    summary: "Kernel, CLI surface, and plan pipeline on a minimal CPU footprint.",
    detail: "fast start · smallest surface",
  },
  {
    name: "med",
    summary: "Adds the memory service, media filesystem, and gateway connections.",
    detail: "default for durable sessions",
  },
  {
    name: "heavy",
    summary: "Hosts harness templates and optional GPU/model lanes beside CPU work.",
    detail: "full workbench",
  },
];

export default function Page() {
  return (
    <PageShell tone="dark">
      <section className="relative overflow-hidden bg-[#03100a]">
        <div className="absolute inset-0">
          <CrtBackground version={ZAP_VERSION} />
        </div>
        <div className="relative z-10 mx-auto flex min-h-[92svh] max-w-7xl flex-col justify-between px-5 py-5 lg:px-8">
          <SiteNav tone="dark" />
          <div className="flex flex-col items-start gap-3 pb-8 sm:flex-row sm:items-center sm:justify-end">
            <CopyCommandCta command={mcpCommand} />
            <GlassCta href={ZAP_DOCS_URL} tone="sulfur">
              <BookOpen className="size-4" />
              Read Docs
            </GlassCta>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#05080c]/72">
        <Image
          alt=""
          className="pointer-events-none absolute right-[-7rem] bottom-[-6rem] hidden h-[36rem] w-[36rem] rotate-[-8deg] object-contain opacity-[0.09] lg:block"
          height={720}
          priority
          src="/zaplogo.png"
          width={720}
        />
        <div className="mx-auto grid max-w-7xl content-between px-5 pb-10 lg:px-8">
          <div className="relative z-10 max-w-5xl py-14 lg:py-16">
            <p className="font-mono text-[12px] tracking-[0.24em] text-[#f6ff00] uppercase">
              @wzrdtech/zap · v{ZAP_VERSION} · node 24.x
            </p>
            <h1 className="mt-5 text-balance font-semibold text-[clamp(3rem,8vw,5.75rem)] leading-[0.9] text-white tracking-normal">
              Agents need a computer.
            </h1>
            <p className="mt-6 max-w-3xl text-pretty text-xl leading-8 text-white/72">
              Zap composes a CPU runtime on an isolated Zap sandbox VM by default, renders agents as
              code, and plans side-effecting tools before live execution.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <GlassCta href={`${ZAP_DOCS_URL}/quickstart`} tone="sulfur">
                <ArrowRight className="size-4" />
                Open the v5 quickstart
              </GlassCta>
              <GlassCta href="/quickstart">
                <Plug className="size-4" />
                Connect your agent
              </GlassCta>
            </div>
            <div className="mt-10 max-w-3xl">
              <CodeWindow label="safe first run — no sandbox acquired, nothing spends" status="plan-safe">
                {doctorCommand}
              </CodeWindow>
            </div>
          </div>

          <div aria-hidden className="zap-hairline" />
          <div className="grid gap-3 pt-5 sm:grid-cols-3">
            <RuntimeSignal
              icon={<Workflow className="size-4" />}
              label="Plan-only by default"
              value="Side-effecting tools are planned, never executed, until you pass --live with a payer. Read-only work may run; model tokens meter under the payer."
            />
            <RuntimeSignal
              icon={<Boxes className="size-4" />}
              label="Isolated sandbox VMs"
              value="Each runtime composes onto its own Zap sandbox VM. CPU work is sandbox.exec inside the tenant boundary."
            />
            <RuntimeSignal
              icon={<KeyRound className="size-4" />}
              label="Write-only secrets"
              value="Agent secrets resolve only inside declared HTTPS connections and never appear in bundles, events, or --json output."
            />
          </div>
        </div>
      </section>

      <section className="relative bg-[#05080c]/80 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[minmax(0,0.78fr)_minmax(440px,0.98fr)] lg:items-center lg:px-8">
          <div className="max-w-xl">
            <Eyebrow tone="amber">
              <Sparkles className="size-4" />
              Featured launch film
            </Eyebrow>
            <p className="mt-5 font-mono text-[12px] tracking-[0.2em] text-zap-cyan uppercase">OpenIntuition × Stripe Link · 00:38</p>
            <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight sm:text-5xl">Intuition &gt; Instinct.</h2>
            <p className="mt-5 text-pretty text-lg leading-8 text-white/62">
              A concept film for a simple interaction: ask in iMessage, let an agent do the legwork, then approve an exact total before the checkout happens.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <GlassCta href="/openintuition" tone="sulfur">
                Explore OpenIntuition
                <ArrowRight className="size-4" />
              </GlassCta>
              <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-5 font-medium text-white transition hover:bg-white/10" href="https://github.com/WZRD-tech-Inc/OpenIntuiton" rel="noreferrer" target="_blank">
                View source
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>

          <figure className="zap-gradient-frame overflow-hidden rounded-lg bg-black shadow-[0_28px_80px_rgba(0,0,0,0.5)]">
            <video aria-label="OpenIntuition launch film" className="aspect-video h-auto w-full bg-black" controls playsInline poster="/openintuition/intuition-over-instinct-poster.jpg" preload="metadata">
              <source src="/openintuition/intuition-over-instinct.mp4" type="video/mp4" />
              <track default kind="captions" label="English" src="/openintuition/intuition-over-instinct.en.vtt" srcLang="en" />
              Your browser does not support the video tag.
            </video>
            <figcaption className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-[11px] text-white/50">
              <span>INTUITION_OVER_INSTINCT.MP4</span>
              <span>38 SEC</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="relative">
      <section className="relative bg-[#05080c]/80 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[380px_1fr] lg:px-8">
          <div>
            <Eyebrow>
              <History className="size-4" />
              Execution trace
            </Eyebrow>
            <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight">
              Every step is an event you can inspect before it becomes live.
            </h2>
            <p className="mt-4 text-pretty leading-7 text-white/62">
              A session turn renders instructions, plans side effects with quotes and caps, and
              waits. Nothing acquires or spends until you approve it.
            </p>
            <p className="mt-3 font-mono text-xs text-white/40">Example trace — illustrative, not a live session.</p>
          </div>
          <CodeWindow label="zap session --agent transcode --json" status="plan">
            {executionTrace}
          </CodeWindow>
        </div>
      </section>

      <section className="relative bg-zap-ink/80 text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <Eyebrow>
            <Cpu className="size-4" />
            Why CPU
          </Eyebrow>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1fr]">
            <h2 className="text-balance font-semibold text-4xl leading-tight">
              Most agent work is CPU work: files, ffmpeg, builds, HTTP, git.
            </h2>
            <p className="text-pretty leading-7 text-white/62">
              Zap treats the CPU sandbox as the default substrate. Instructions render for free on
              CPU; model thinking and GPU lanes are plugins that attach only when a runtime declares
              them. Compose from <span className="font-mono text-zap-cyan">Runtime.md</span> or{" "}
              <span className="font-mono text-zap-cyan">zap.config.ts</span>, deploy immutably by
              SHA, and keep durable sessions pinned to the deployment they started on.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {profiles.map((profile) => (
              <div className="zap-gradient-card rounded-md p-5" key={profile.name}>
                <p className="font-mono text-sm text-zap-cyan">--weight {profile.name}</p>
                <p className="mt-3 text-sm leading-6 text-white/62">{profile.summary}</p>
                <p className="mt-4 rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-white/50">
                  {profile.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-[#05080c]/80 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[1fr_500px] lg:px-8">
          <div>
            <Eyebrow>
              <Braces className="size-4" />
              Agents as code
            </Eyebrow>
            <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight">
              A synchronous render function. Hooks attach everything else.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-white/62">
              <span className="font-mono text-zap-cyan">useModel</span>,{" "}
              <span className="font-mono text-zap-cyan">useTool</span>, and MCP hooks declare
              capabilities on every turn — conditionally, from empty. The runtime executes after
              render, inside the sandbox, under plan/live gating. Connect any MCP-capable coding
              agent with one command:
            </p>
            <div className="mt-5 max-w-xl">
              <CodeWindow label="MCP — stdio" status="copy & connect">
                {mcpCommand}
              </CodeWindow>
            </div>
          </div>
          <div className="grid content-start gap-3">
            <RuntimeRow
              icon={<ShieldCheck className="size-5" />}
              title="Payer or it fails closed"
              body="Missing payer fails with PAYER_MISSING before the first model step. There is no silent downgrade."
              detail="plan · live gated"
            />
            <RuntimeRow
              icon={<KeyRound className="size-5" />}
              title="Declared egress only"
              body="Outbound HTTP goes through declared HTTPS connections with method and path-prefix policies."
              detail="write-only secrets"
            />
            <RuntimeRow
              icon={<Boxes className="size-5" />}
              title="Immutable deployments"
              body="zap deploy content-addresses each bundle; aliases move, sessions stay pinned to their deployment."
              detail="sha-addressed"
            />
          </div>
        </div>
      </section>

      <section className="relative bg-zap-ink/80 text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Eyebrow tone="amber">
                <Plug className="size-4" />
                Providers · one contract, server-side keys
              </Eyebrow>
              <h2 className="mt-4 font-semibold text-4xl leading-tight">
                Every provider Zap composes with.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
                {PROVIDER_COUNT} providers across sandboxes, LLM routes, media generation, and
                payment rails — plan-only runs quote against rate tables and never contact a
                provider; keys stay server-side.
              </p>
            </div>
            <GlassCta href="/providers">
              Explore providers
              <ArrowRight className="size-4" />
            </GlassCta>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {FEATURED_PROVIDERS.map((provider) => (
              <ProviderCard key={provider.name} provider={provider} />
            ))}
          </div>

          <div aria-hidden className="zap-hairline mt-12" />
          <div className="grid gap-4 pt-8 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h2 className="font-semibold text-2xl leading-tight">Start with zero side effects.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/62">
                Run the doctor, read the docs, connect your agent. Nothing acquires a sandbox or
                spends until you say so.
              </p>
            </div>
            <div className="grid gap-3 sm:justify-items-end">
              <div className="w-full max-w-md sm:w-[28rem]">
                <CodeWindow label="safe first run" status="plan-safe">
                  {doctorCommand}
                </CodeWindow>
              </div>
              <GlassCta href={ZAP_DOCS_URL}>
                Read the v5 docs
                <ArrowRight className="size-4" />
              </GlassCta>
            </div>
          </div>
        </div>
      </section>
      </div>
    </PageShell>
  );
}

function RuntimeSignal({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="zap-gradient-card rounded-md p-4">
      <div className="flex items-center gap-2 text-zap-cyan">
        {icon}
        <p className="font-medium text-sm text-white">{label}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-white/60">{value}</p>
    </div>
  );
}

function RuntimeRow({ body, detail, icon, title }: { readonly body: string; readonly detail: string; readonly icon: ReactNode; readonly title: string }) {
  return (
    <div className="zap-gradient-card grid gap-4 rounded-md p-4 sm:grid-cols-[44px_1fr_150px] sm:items-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-black/50 text-zap-cyan">{icon}</div>
      <div>
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-white/58">{body}</p>
      </div>
      <p className="rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-white/50">{detail}</p>
    </div>
  );
}
