import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen, Boxes, CheckCircle2, Code2, Film, Play, ShieldCheck, Sparkles, TerminalSquare } from "lucide-react";
import { listZapSpecs } from "@/lib/zap-files";

export default async function Page() {
  const zaps = await listZapSpecs();
  return (
    <main className="min-h-dvh bg-[#f6f6f0] text-zinc-950">
      <section className="border-zinc-200 border-b bg-white">
        <div className="mx-auto grid min-h-[88dvh] max-w-7xl grid-cols-1 content-between px-5 py-5 lg:px-8">
          <nav className="flex items-center justify-between gap-4">
            <Link className="flex items-center gap-3" href="/">
              <Image alt="Zap" className="rounded-md" height={34} src="/icon.png" width={34} />
              <span className="font-semibold text-lg">Zap</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 sm:inline-flex" href="/docs">Docs</Link>
              <Link className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 sm:inline-flex" href="/gallery">Gallery</Link>
              <Link className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 sm:inline-flex" href="/settings">Settings</Link>
              <Link className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-3 py-2 font-medium text-sm text-white" href="/studio">
                <TerminalSquare className="size-4" />
                Studio
              </Link>
            </div>
          </nav>

          <div className="grid items-center gap-8 py-10 lg:grid-cols-[1fr_460px] lg:py-14">
            <div className="max-w-3xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-sm text-teal-900">
                <Sparkles className="size-4" />
                Lightweight agents for one-click video recipes
              </p>
              <h1 className="max-w-4xl font-semibold text-5xl leading-[1.02] tracking-normal sm:text-6xl lg:text-7xl">
                Zap
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-zinc-600 leading-8">
                Package generative media workflows as portable Eve skills, run them from a creator UI or CLI, and keep every step inspectable by coding agents.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-5 font-medium text-white" href="/zap/world-cup-entrance">
                  <Play className="size-4" />
                  Run demo Zap
                </Link>
                <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-5 font-medium" href="/quickstart">
                  <BookOpen className="size-4" />
                  Agent quickstart
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-[#101311] p-4 text-white shadow-sm">
              <div className="flex items-center justify-between border-white/10 border-b pb-3">
                <div className="flex items-center gap-2">
                  <Image alt="Zap icon" className="rounded" height={28} src="/icon.png" width={28} />
                  <span className="font-medium">npx @zap-md/cli</span>
                </div>
                <span className="rounded bg-emerald-400/15 px-2 py-1 text-emerald-200 text-xs">mock safe</span>
              </div>
              <pre className="overflow-x-auto py-4 text-[13px] leading-6 text-zinc-200"><code>{`zap new match-day-opener
zap validate
zap run agent/skills/zap-match-day-opener/Zap.md --json

{
  "mode": "mock",
  "status": "done",
  "zapUrl": "mock://zap/.../Zap.mp4"
}`}</code></pre>
            </div>
          </div>

          <div className="grid gap-3 border-zinc-200 border-t pt-5 sm:grid-cols-3">
            <Signal icon={<ShieldCheck className="size-4" />} label="Spend guard" value="Live providers require explicit approval." />
            <Signal icon={<Boxes className="size-4" />} label="Portable skills" value={`${zaps.length} recipes installed locally.`} />
            <Signal icon={<Code2 className="size-4" />} label="Agent-readable" value="Docs, schema, prompts, and registry are file-first." />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-semibold text-3xl tracking-normal">Installed Zaps</h2>
            <p className="mt-2 max-w-2xl text-zinc-600">Each recipe is a complete skill directory with `SKILL.md`, `Zap.md`, and prompt files.</p>
          </div>
          <Link className="inline-flex items-center gap-2 font-medium text-sm" href="/gallery">
            View gallery
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {zaps.map((zap) => (
            <Link className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400" href={`/zap/${zap.zap}`} key={zap.zap}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-xl">{zap.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600 leading-6">{zap.description}</p>
                </div>
                <Film className="size-5 shrink-0 text-teal-700" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-zinc-100 px-2 py-1">{zap.steps.length} steps</span>
                <span className="rounded bg-zinc-100 px-2 py-1">${zap.budget.estimate_usd.toFixed(2)} estimate</span>
                <span className="rounded bg-zinc-100 px-2 py-1">{zap.defaults.provider}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-zinc-200 border-t bg-white">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-3 lg:px-8">
          <Feature icon={<TerminalSquare className="size-5" />} title="CLI first" text="Create, validate, lint, run, and inspect recipes from a terminal or agent loop." />
          <Feature icon={<ShieldCheck className="size-5" />} title="Durable runtime" text="Convex tracks runs while Upstash handles idempotency and polling queues." />
          <Feature icon={<Sparkles className="size-5" />} title="Creator ready" text="The web runner collects inputs, shows stages, and can demo in mock mode." />
        </div>
      </section>
    </main>
  );
}

function Signal({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="flex gap-3 rounded-md bg-zinc-50 p-3">
      <div className="mt-0.5 text-teal-700">{icon}</div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="mt-1 text-zinc-600 text-xs leading-5">{value}</p>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { readonly icon: ReactNode; readonly title: string; readonly text: string }) {
  return (
    <div>
      <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-amber-100 text-amber-900">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600 leading-6">{text}</p>
    </div>
  );
}
