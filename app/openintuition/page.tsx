import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, CircleDollarSign, Code2, ExternalLink, LockKeyhole, MessageCircleMore, SearchCheck, Sparkles } from "lucide-react";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { GlassCta } from "@/app/_components/threeui/glass-cta";

const OPENINTUITION_GITHUB_URL = "https://github.com/WZRD-tech-Inc/OpenIntuiton";
const OPENINSTINCT_GITHUB_URL = "https://github.com/Merit-Systems/OpenInstinct";

export const metadata: Metadata = {
  title: "OpenIntuition — Intuition > Instinct",
  description: "A concept for agent-assisted shopping with human approval at checkout.",
};

export default function OpenIntuitionPage() {
  return (
    <PageShell tone="dark">
      <section className="relative overflow-hidden bg-[#03100a]">
        <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
          <SiteNav tone="dark" />
          <div className="grid gap-10 py-16 lg:grid-cols-[minmax(0,0.86fr)_minmax(440px,0.92fr)] lg:items-center lg:py-24">
            <div className="max-w-3xl">
              <Eyebrow tone="amber">
                <Sparkles className="size-4" />
                OpenIntuition × Stripe Link
              </Eyebrow>
              <p className="mt-8 font-mono text-[12px] tracking-[0.24em] text-[#f6ff00] uppercase">Agent-assisted checkout, with a human in control</p>
              <h1 className="mt-5 text-balance font-semibold text-[clamp(4.25rem,11vw,8.5rem)] leading-[0.82] text-white tracking-[-0.07em]">
                Intuition <span className="text-zap-cyan">&gt;</span> Instinct.
              </h1>
              <p className="mt-7 max-w-2xl text-pretty text-xl leading-8 text-white/68">
                OpenIntuition turns a plain-language request into a researched basket, then returns with one clear question: do you approve this exact total?
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#f6ff00] px-5 font-semibold text-zap-ink transition hover:bg-white" href={OPENINTUITION_GITHUB_URL} rel="noreferrer" target="_blank">
                  <Code2 className="size-4" />
                  Open source project
                  <ExternalLink className="size-4" />
                </a>
                <GlassCta href="/">
                  Back to Zap
                  <ArrowRight className="size-4" />
                </GlassCta>
              </div>
            </div>

            <div className="zap-gradient-frame overflow-hidden rounded-xl bg-black shadow-[0_32px_96px_rgba(0,0,0,0.55)]">
              <video aria-label="OpenIntuition launch film" className="aspect-video h-auto w-full bg-black" controls playsInline poster="/openintuition/intuition-over-instinct-poster.jpg" preload="metadata">
                <source src="/openintuition/intuition-over-instinct.mp4" type="video/mp4" />
                <track default kind="captions" label="English" src="/openintuition/intuition-over-instinct.en.vtt" srcLang="en" />
                Your browser does not support the video tag.
              </video>
              <div className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-[11px] text-white/50">
                <span>LAUNCH_FILM / 00:38</span>
                <span>1080P</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f2ea] text-zap-ink">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:grid-cols-2 lg:px-8">
          <div className="flex min-h-40 items-center rounded-lg border border-black/10 bg-white px-7 shadow-[0_14px_40px_rgba(7,9,13,0.08)]">
            <Image alt="OpenIntuition logo" className="h-auto w-full max-w-[470px]" height={967} priority src="/openintuition/openintuition-logo.png" width={3604} />
          </div>
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-black/10 bg-[#0b0d13] px-10 shadow-[0_14px_40px_rgba(7,9,13,0.12)]">
            <Image alt="Stripe logo" className="h-auto w-full max-w-[270px]" height={400} src="/openintuition/stripe-logo.webp" width={960} />
          </div>
        </div>
      </section>

      <section className="relative bg-[#05080c]/80 text-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <Eyebrow>
              <MessageCircleMore className="size-4" />
              The interaction model
            </Eyebrow>
            <h2 className="mt-5 text-balance font-semibold text-4xl leading-tight sm:text-5xl">The request stays human. The work becomes agentic.</h2>
            <p className="mt-5 text-pretty text-lg leading-8 text-white/62">
              The launch film follows a familiar moment: dinner needs groceries. Rather than turning that into a checkout surprise, OpenIntuition makes the research visible and keeps the final payment decision with the person who asked.
            </p>
          </div>

          <ol className="mt-12 grid gap-4 lg:grid-cols-4">
            <FlowStep icon={<MessageCircleMore className="size-5" />} number="01" title="Ask naturally" body="A request begins in the conversational surface people already use: “Can you get groceries for dinner?”" />
            <FlowStep icon={<SearchCheck className="size-5" />} number="02" title="Research the basket" body="A browser-use agent compares availability and turns the request into a cart with concrete choices." />
            <FlowStep icon={<CircleDollarSign className="size-5" />} number="03" title="Return one total" body="The agent sends the item count and exact total back for review—before any charge can happen." />
            <FlowStep icon={<LockKeyhole className="size-5" />} number="04" title="Approve deliberately" body="Stripe Link is the approval moment: a familiar, secure handoff where the user stays in control." />
          </ol>
        </div>
      </section>

      <section className="relative bg-zap-ink/80 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:px-8 lg:py-20">
          <div>
            <Eyebrow tone="amber">
              <CheckCircle2 className="size-4" />
              Built in the open
            </Eyebrow>
            <h2 className="mt-5 max-w-3xl text-balance font-semibold text-4xl leading-tight sm:text-5xl">OpenIntuition is built on OpenInstinct by Merit Labs.</h2>
            <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-white/62">
              The project connects OpenInstinct’s open framework for agent capabilities to a checkout experience designed around informed consent: an agent can prepare the work, but it cannot skip the person’s approval.
            </p>
          </div>

          <div className="zap-gradient-card grid gap-3 rounded-lg p-4">
            <a className="group flex min-h-16 items-center justify-between gap-4 rounded-md px-4 transition hover:bg-white/[0.06]" href={OPENINTUITION_GITHUB_URL} rel="noreferrer" target="_blank">
              <span>
                <span className="block font-semibold text-white">OpenIntuition</span>
                <span className="mt-1 block font-mono text-[11px] text-white/48">github.com/WZRD-tech-Inc/OpenIntuiton</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-zap-cyan transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <a className="group flex min-h-16 items-center justify-between gap-4 rounded-md px-4 transition hover:bg-white/[0.06]" href={OPENINSTINCT_GITHUB_URL} rel="noreferrer" target="_blank">
              <span>
                <span className="block font-semibold text-white">OpenInstinct by Merit Labs</span>
                <span className="mt-1 block font-mono text-[11px] text-white/48">github.com/Merit-Systems/OpenInstinct</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-zap-cyan transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function FlowStep({ body, icon, number, title }: { readonly body: string; readonly icon: ReactNode; readonly number: string; readonly title: string }) {
  return (
    <li className="zap-gradient-card relative rounded-lg p-5">
      <span className="font-mono text-[11px] text-zap-cyan">{number}</span>
      <div className="mt-7 flex size-10 items-center justify-center rounded-md border border-zap-cyan/20 bg-zap-cyan/10 text-zap-cyan">{icon}</div>
      <h3 className="mt-5 font-semibold text-xl text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/58">{body}</p>
    </li>
  );
}
