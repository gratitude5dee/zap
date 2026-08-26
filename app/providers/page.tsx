import type { Metadata } from "next";
import Image from "next/image";
import { Boxes, Cpu, Film, Plug, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";

export const metadata: Metadata = {
  title: "Providers",
  description:
    "Every provider Zap composes with: sandboxes, LLM routes, media generation, and payments — with plan-first quoting and server-side keys.",
};

type Provider = {
  readonly name: string;
  readonly logo: string;
  readonly description: string;
  readonly offerings: readonly string[];
  readonly id?: string;
  readonly badge?: string;
};

type ProviderCategory = {
  readonly title: string;
  readonly icon: ReactNode;
  readonly blurb: string;
  readonly providers: readonly Provider[];
};

const CATEGORIES: readonly ProviderCategory[] = [
  {
    title: "Sandboxes",
    icon: <Boxes className="size-5" />,
    blurb:
      "Isolated Zap sandbox VMs and containers where CPU work executes. Same contract everywhere: exec, files, snapshots, ports.",
    providers: [
      {
        name: "Zap Sandbox",
        logo: "/zaplogo.png",
        badge: "default",
        id: "box",
        description: "Zap's default sandbox: full VMs on ascii.dev.",
        offerings: ["Snapshots + fork", "Stop / resume", "Hosted ports", "Desktop streaming", "Docker inside"],
      },
      {
        name: "E2B",
        logo: "/providers/e2b.png",
        id: "e2b",
        description: "Firecracker microVM sandboxes.",
        offerings: ["Pause / resume snapshots", "Public HTTPS ports"],
      },
      {
        name: "Daytona",
        logo: "/providers/daytona.png",
        id: "daytona",
        description: "Container sandboxes.",
        offerings: ["Snapshots", "HTTPS preview links"],
      },
      {
        name: "Cloudflare Sandbox",
        logo: "/providers/cloudflare.svg",
        id: "cloudflare",
        description: "Container sandboxes on Cloudflare Workers.",
        offerings: ["Backup / restore snapshots", "Public preview ports"],
      },
      {
        name: "Docker",
        logo: "/providers/docker.svg",
        id: "docker",
        description: "Local container sandboxes for development.",
        offerings: ["Same contract locally", "Container isolation", "No cloud account required"],
      },
      {
        name: "microsandbox",
        logo: "/providers/microsandbox.png",
        id: "microsandbox",
        description: "microVM isolation on self-hosted KVM hosts.",
        offerings: ["Self-hosted KVM", "microsandbox SDK (pinned 0.6.15)"],
      },
      {
        name: "Namespace",
        logo: "/providers/namespace.svg",
        id: "namespace",
        description: "Linux containers and native macOS Apple-silicon instances.",
        offerings: ["Linux container instances", "macOS Apple-silicon instances", "Two-token bridge"],
      },
      {
        name: "Modal",
        logo: "/providers/modal.svg",
        badge: "GPU lane",
        id: "modal",
        description: "The GPU lane target — mounts only when a gpu lane is declared.",
        offerings: ["On-demand GPU functions", "Declared gpu lanes only"],
      },
    ],
  },
  {
    title: "LLM routes",
    icon: <Cpu className="size-5" />,
    blurb:
      "Model providers behind the gateway. Deterministic routing, pure quotes, and provider keys that never leave the server side.",
    providers: [
      {
        name: "OpenRouter",
        logo: "/providers/openrouter-dark.svg",
        badge: "default",
        id: "openrouter",
        description: "Default LLM route across hundreds of models.",
        offerings: ["Multi-model routing", "BYOK or managed"],
      },
      {
        name: "OpenAI",
        logo: "/providers/openai-dark.svg",
        id: "openai",
        description: "GPT model family, including Codex device auth.",
        offerings: ["GPT models", "Codex device-auth login"],
      },
      {
        name: "Anthropic",
        logo: "/providers/anthropic-dark.svg",
        id: "anthropic",
        description: "Claude model family, including Claude Code auth.",
        offerings: ["Claude models", "Claude Code device-auth login"],
      },
      {
        name: "xAI",
        logo: "/providers/xai-dark.svg",
        id: "xai",
        description: "Grok model family.",
        offerings: ["Grok models"],
      },
      {
        name: "Vercel AI Gateway",
        logo: "/providers/vercel-dark.svg",
        id: "gateway",
        description: "Vercel's multi-provider AI gateway.",
        offerings: ["Unified model access", "Provider fallback"],
      },
      {
        name: "GMI Cloud",
        logo: "/providers/gmi.png",
        id: "gmi",
        description: "GPU cloud inference for LLM and media models.",
        offerings: ["LLM inference", "Seedance video models"],
      },
    ],
  },
  {
    title: "Media generation",
    icon: <Film className="size-5" />,
    blurb:
      "Image, video, and audio generation providers. Plan-only never contacts a provider; live runs require a payer and explicit intent.",
    providers: [
      {
        name: "fal",
        logo: "/providers/fal-dark.svg",
        id: "fal",
        description: "Fast image and video model inference.",
        offerings: ["Image generation", "Video generation", "Webhook result delivery"],
      },
      {
        name: "Prodia",
        logo: "/providers/prodia.png",
        id: "prodia",
        description: "Low-cost image generation API.",
        offerings: ["Image generation", "Webhook result delivery"],
      },
      {
        name: "Runware",
        logo: "/providers/runware.svg",
        id: "runware",
        description: "Sub-second image inference network.",
        offerings: ["Image generation", "Webhook result delivery"],
      },
      {
        name: "Replicate",
        logo: "/providers/replicate-dark.svg",
        id: "replicate",
        description: "Open-model marketplace for media generation.",
        offerings: ["Image / video / audio models", "Open-weights catalog"],
      },
      {
        name: "AWS Bedrock",
        logo: "/providers/bedrock-dark.svg",
        id: "aws",
        description: "Amazon's managed foundation-model service.",
        offerings: ["Nova / Titan media models", "Enterprise IAM auth"],
      },
      {
        name: "Vertex AI",
        logo: "/providers/vertexai-dark.svg",
        id: "vertex",
        description: "Google Cloud's foundation-model platform.",
        offerings: ["Imagen + Veo models", "Google Cloud auth"],
      },
      {
        name: "GMI Cloud",
        logo: "/providers/gmi.png",
        id: "gmi",
        description: "Seedance video generation, used by the Air iMessage service.",
        offerings: ["Seedance video", "Air video pipeline"],
      },
    ],
  },
  {
    title: "Payments",
    icon: <Wallet className="size-5" />,
    blurb:
      "Zap never spends money by default. Every runtime resolves a payer before executing a prompt — quoted, metered, capped, fail-closed.",
    providers: [
      {
        name: "thirdweb",
        logo: "/providers/thirdweb.svg",
        description: "Wallet auth for Studio and managed payment sessions.",
        offerings: ["SIWE wallet sign-in", "Scoped session keys", "Spend caps"],
      },
      {
        name: "Coinbase x402",
        logo: "/providers/coinbase.svg",
        description: "x402 v2 payment protocol through the Zap Cloud payment gate.",
        offerings: ["PAYMENT-SIGNATURE settlement", "Replay-protected receipts", "MPP also accepted"],
      },
    ],
  },
];

export default function ProvidersPage() {
  const total = CATEGORIES.reduce((n, c) => n + c.providers.length, 0);

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
              <RegistryMetric label="providers" value={String(total)} />
              <RegistryMetric label="default mode" value="plan" />
            </div>
          </div>
        </header>
        <div aria-hidden className="zap-hairline" />

        {CATEGORIES.map((category) => (
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

function ProviderCard({ provider }: { readonly provider: Provider }) {
  return (
    <div className="zap-gradient-card rounded-md p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5 p-1.5">
          <Image
            alt={`${provider.name} logo`}
            className="h-full w-full object-contain"
            height={40}
            src={provider.logo}
            width={40}
          />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-white">{provider.name}</h3>
            {provider.badge ? (
              <span className="rounded-full bg-zap-cyan/15 px-2 py-0.5 font-mono text-[10px] text-zap-cyan uppercase tracking-wide">
                {provider.badge}
              </span>
            ) : null}
          </div>
          {provider.id ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-white/40">{provider.id}</p>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/58">{provider.description}</p>
      <ul className="mt-3 space-y-1.5">
        {provider.offerings.map((offering) => (
          <li className="flex items-start gap-2 text-[13px] leading-5 text-white/50" key={offering}>
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-zap-cyan/70" />
            {offering}
          </li>
        ))}
      </ul>
    </div>
  );
}
