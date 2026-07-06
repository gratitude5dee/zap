import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  KeyRound,
  Play,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { CodeWindow, Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { ZapCard } from "@/app/_components/zap-card";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";
import { listZapSpecs } from "@/lib/zap-files";

const cliProof = `npx @wzrdtech/zap@0.3.0 init match-day
cd match-day
npx @wzrdtech/zap@0.3.0 new world-cup-entrance
npx @wzrdtech/zap@0.3.0 validate
npx @wzrdtech/zap@0.3.0 run agent/skills/zap-world-cup-entrance/Zap.md --json

{
  "mode": "plan",
  "status": "planned",
  "quoteUsd": 1.50
}`;

export default async function Page() {
  const zaps = await listZapSpecs();
  const featured = zaps.slice(0, 4);

  return (
    <PageShell tone="dark">
      <section className="zap-data-field relative overflow-hidden border-white/10 border-b">
        <Image
          alt=""
          className="pointer-events-none absolute right-[-7rem] bottom-[-6rem] hidden h-[36rem] w-[36rem] rotate-[-8deg] object-contain opacity-[0.09] lg:block"
          height={720}
          priority
          src="/zaplogo.png"
          width={720}
        />
        <div className="mx-auto grid min-h-[86svh] max-w-7xl content-between px-5 py-5 lg:px-8">
          <SiteNav tone="dark" />

          <div className="relative z-10 max-w-5xl py-10 lg:py-12">
            <p className="font-mono text-[12px] tracking-[0.24em] text-[#f6ff00] uppercase">agent media runtime / v0.3.0</p>
            <h1 className="mt-5 text-balance font-semibold text-[clamp(4.5rem,18vw,12rem)] leading-[0.78] text-white tracking-normal">
              Zap
            </h1>
            <p className="mt-6 max-w-3xl text-pretty text-xl leading-8 text-white/72">
              File-first media recipes for agents, creators, and operators: provider routes, budgets, assets, gallery slugs, and finalization all stay inspectable.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#f6ff00] px-5 font-semibold text-[#1a1a1a] transition hover:bg-white" href="/zap/world-cup-entrance">
                <Play className="size-4" />
                Run demo Zap
              </Link>
              <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-5 font-medium text-white transition hover:bg-white/10" href="/quickstart">
                <TerminalSquare className="size-4" />
                Agent quickstart
              </Link>
            </div>
            <div className="mt-10 max-w-3xl overflow-hidden rounded-md border border-white/10 bg-[#1a1a1a]/70">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <Signal label="recipes" value={String(zaps.length)} />
                <Signal label="default" value="draft + plan" />
                <Signal label="package" value="@wzrdtech/zap" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-white/10 border-t pt-5 sm:grid-cols-3">
            <RuntimeSignal icon={<BadgeDollarSign className="size-4" />} label="Zero-spend demos" value="Plan-only runs are the default until the creator explicitly chooses live providers." />
            <RuntimeSignal icon={<Workflow className="size-4" />} label="Durable run state" value="Convex records runs while Upstash handles idempotency, queues, and polling." />
            <RuntimeSignal icon={<KeyRound className="size-4" />} label="BYOK vault" value="Provider keys stay user-owned in Supabase, masked in the browser." />
          </div>
        </div>
      </section>

      <section className="border-white/10 border-b bg-[#05080c] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[380px_1fr] lg:px-8">
          <div>
            <Eyebrow>
              <Braces className="size-4" />
              Zap.md runtime contract
            </Eyebrow>
            <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight">
              Recipes agents can read, creators can run, and operators can meter.
            </h2>
            <p className="mt-4 text-pretty leading-7 text-white/62">
              Zap keeps prompts, provider routing, budget caps, input contracts, and output shape in files first. The studio is the control room, not a black box.
            </p>
            <Link className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-4 font-medium text-sm text-white transition hover:bg-white/10" href={ZAP_DOCS_URL}>
              Read the schema docs
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-3">
            <RuntimeRow icon={<Boxes className="size-5" />} title="Skill package" body="Every Zap ships as SKILL.md, Zap.md, prompt files, and registry metadata." detail={`${zaps.length} local recipes`} />
            <RuntimeRow icon={<ShieldCheck className="size-5" />} title="Budget guard" body="CLI and server paths estimate spend, enforce caps, and require explicit live approval." detail="plan by default" />
            <RuntimeRow icon={<Clock3 className="size-5" />} title="Polling flow" body="Provider submissions enqueue durable poll jobs and update Convex idempotently." detail="retry + dead letter" />
          </div>
        </div>
      </section>

      <section className="bg-zap-ink text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-sm text-zap-cyan">installed recipes</p>
              <h2 className="mt-2 font-semibold text-4xl leading-tight">Creator flows ready to run</h2>
            </div>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-4 font-medium text-sm text-white transition hover:bg-white/10" href="/gallery">
              View gallery
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featured.map((zap) => (
              <ZapCard href={`/zap/${zap.zap}`} key={zap.zap} variant="mini" zap={zap} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-white/10 border-t bg-[#05080c] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[1fr_500px] lg:px-8">
          <div>
            <Eyebrow tone="amber">
              <CheckCircle2 className="size-4" />
              Agent-compatible by design
            </Eyebrow>
            <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight">
              Point Codex, Claude Code, Cursor, OpenClaw, or Hermes at the URL.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-white/62">
              The framework exposes skill downloads, JSON manifests, docs topics, and plan commands so agents can start with evidence.
            </p>
          </div>
          <div className="grid gap-4">
            <CodeWindow label="install" status="published">
              {cliProof}
            </CodeWindow>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <Endpoint label="Manifest" value="https://zap.wzrd.tech/api/skills" />
              <Endpoint label="Core skill" value="https://zap.wzrd.tech/api/skills/zap" />
              <Endpoint label="Authoring" value="https://zap.wzrd.tech/api/skills/zap-authoring" />
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function Signal({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="font-mono text-[11px] text-white/45">{label}</p>
      <p className="mt-1 truncate font-semibold text-sm text-white">{value}</p>
    </div>
  );
}

function RuntimeSignal({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.055] p-4">
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
    <div className="grid gap-4 rounded-md border border-white/10 bg-white/[0.045] p-4 sm:grid-cols-[44px_1fr_150px] sm:items-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-black/50 text-zap-cyan">{icon}</div>
      <div>
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-white/58">{body}</p>
      </div>
      <p className="rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/50">{detail}</p>
    </div>
  );
}

function Endpoint({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-zap-ink px-3 py-3">
      <span className="font-medium text-white/70">{label}</span>
      <span className="break-all font-mono text-zap-cyan text-xs">{value}</span>
    </div>
  );
}
