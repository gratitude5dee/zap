import type { Metadata } from "next";
import { Plug } from "lucide-react";
import { PROVIDER_CATEGORIES, PROVIDER_COUNT, ProviderCard } from "@/app/_components/provider-catalog";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";

export const metadata: Metadata = {
  title: "Providers",
  description:
    "Every provider Zap composes with: sandboxes, LLM routes, media generation, and payments — with plan-first quoting and server-side keys.",
};

export default function ProvidersPage() {
  return (
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />

        <header className="mt-12 pb-10">
          <Eyebrow tone="amber">
            <Plug className="size-4" />
            Providers · one contract, server-side keys
          </Eyebrow>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <h1 className="text-balance font-semibold text-5xl leading-none text-white sm:text-6xl">
                Every provider Zap composes with.
              </h1>
              <p className="mt-5 max-w-3xl text-pretty leading-7 text-white/62">
                Sandboxes for CPU execution, LLM routes and media generation behind the gateway, and
                payment rails for live spend. Plan-only runs quote against rate tables and never
                contact a provider; keys stay server-side.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <RegistryMetric label="providers" value={String(PROVIDER_COUNT)} />
              <RegistryMetric label="default mode" value="plan" />
            </div>
          </div>
        </header>
        <div aria-hidden className="zap-hairline" />

        {PROVIDER_CATEGORIES.map((category) => (
          <section className="pt-10" key={category.title}>
            <div className="flex items-center gap-3 text-zap-cyan">
              {category.icon}
              <h2 className="font-semibold text-2xl text-white">{category.title}</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{category.blurb}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {category.providers.map((provider) => (
                <ProviderCard key={`${category.title}-${provider.name}`} provider={provider} />
              ))}
            </div>
            <div aria-hidden className="zap-hairline mt-10" />
          </section>
        ))}
      </div>
    </PageShell>
  );
}

function RegistryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="zap-gradient-card rounded-md p-3">
      <p className="font-semibold text-2xl leading-none text-white">{value}</p>
      <p className="mt-2 font-mono text-[11px] text-white/45">{label}</p>
    </div>
  );
}
