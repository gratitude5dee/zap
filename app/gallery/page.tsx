import type { ReactNode } from "react";
import { BadgeDollarSign, Film, Sparkles } from "lucide-react";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { ZapCard } from "@/app/_components/zap-card";
import { listCanonicalZapSpecs } from "@/lib/zap-files";

export default async function GalleryPage() {
  const zaps = await listCanonicalZapSpecs();

  return (
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />

        <header className="mt-12 border-white/10 border-b pb-10">
          <Eyebrow tone="amber">
            <Sparkles className="size-4" />
            Compatible recipes · Legacy 0.3.1 on v5
          </Eyebrow>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <h1 className="text-balance font-semibold text-5xl leading-none text-white sm:text-6xl">Start from a workflow you can inspect.</h1>
              <p className="mt-5 max-w-3xl text-pretty leading-7 text-white/62">
                Media recipes from the 0.3.1 framework, compatible with Zap v5. Open a recipe to inspect its step graph, plan spend against its own estimate and hard cap, and go live only when keys and budgets are ready.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <RegistryMetric label="recipes" value={String(zaps.length)} />
              <RegistryMetric label="default mode" value="plan" />
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {zaps.map((zap) => (
            <ZapCard href={`/zap/${zap.zap}`} key={zap.zap} variant="mini" zap={zap} />
          ))}
        </div>

        <section className="mt-10 grid gap-4 border-white/10 border-t pt-8 md:grid-cols-2">
          <GalleryNote icon={<Film className="size-5" />} title="Inspect before you run" body="Each card opens a runner with plan mode by default: input capture, step graph, progress, output, and feedback." />
          <GalleryNote icon={<BadgeDollarSign className="size-5" />} title="Per-recipe budget guard" body="Every recipe carries its own live estimate and hard cap; live providers require explicit approval per run." />
        </section>
      </div>
    </PageShell>
  );
}

function RegistryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.055] p-3">
      <p className="font-semibold text-2xl leading-none text-white">{value}</p>
      <p className="mt-2 font-mono text-[11px] text-white/45">{label}</p>
    </div>
  );
}

function GalleryNote({ body, icon, title }: { readonly body: string; readonly icon: ReactNode; readonly title: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-5">
      <div className="flex items-center gap-3 text-zap-cyan">
        {icon}
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/58">{body}</p>
    </div>
  );
}
