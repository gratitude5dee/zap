"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PublicZapSpec, ZapStep } from "@/lib/zap-schema";

export type ZapCardRun = {
  readonly costUsd?: number;
  readonly elapsedMs?: number;
  readonly error?: string;
  readonly progress?: number;
  readonly runId?: string;
  readonly stage?: string;
  readonly status?: string;
  readonly zapUrl?: string;
};

export type ZapCardState = "idle" | "running" | "done" | "error";

export function ZapCard({
  className,
  disabled = false,
  error,
  hasImageAttached = false,
  href,
  inputPreview,
  live = false,
  onRun,
  onRunAgain,
  primaryHref,
  run,
  showModels = true,
  showProvider = true,
  state,
  variant = "mini",
  zap,
}: {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly error?: string | null;
  readonly hasImageAttached?: boolean;
  readonly href?: string;
  readonly inputPreview?: Record<string, string>;
  readonly live?: boolean;
  readonly onRun?: () => void;
  readonly onRunAgain?: () => void;
  readonly primaryHref?: string;
  readonly run?: ZapCardRun | null;
  readonly showModels?: boolean;
  readonly showProvider?: boolean;
  readonly state?: ZapCardState;
  readonly variant?: "hero" | "mini";
  readonly zap: PublicZapSpec;
}) {
  const view = useZapCardView(zap, run, state, error);

  if (variant === "mini") {
    const card = (
      <article className={cn("zap-card-shell group h-full overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(0,229,255,0.1)]", className)}>
        <div className={cn("zap-card-media relative h-[150px] overflow-hidden", view.scene === "flash" ? "zap-card-flash" : "zap-card-stadium")}>
          <div className="zap-card-scanlines absolute inset-0" />
          {showProvider ? <ZapChip className="absolute top-3 left-3 z-10">{view.provider}</ZapChip> : null}
          <Image
            alt=""
            className="absolute top-1 right-2 h-[132px] w-[88px] object-cover object-center opacity-85 brightness-125 drop-shadow-[0_0_14px_rgba(0,229,255,0.42)]"
            height={132}
            src="/zaplogo.png"
            width={88}
          />
          <div className="absolute right-3 bottom-3 left-3 z-10">
            <h3 className="font-semibold text-[17px] text-white leading-tight tracking-normal drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">{zap.title}</h3>
          </div>
        </div>
        <div className="grid gap-3 p-3">
          <p className="line-clamp-2 text-[12px] text-[#7d8f9b] leading-6">{zap.description}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10.5px] text-[#00e5ff]">est ${view.estimate} / cap ${view.cap}</span>
            <span className="font-mono text-[10px] text-[#55646e]">{view.stepsLabel}</span>
          </div>
          <SegmentBar segments={view.segments} compact />
        </div>
      </article>
    );

    if (href) {
      return (
        <Link aria-label={`Open ${zap.title}`} className="block h-full" href={href}>
          {card}
        </Link>
      );
    }
    return card;
  }

  return (
    <ZapHeroCard
      className={className}
      disabled={disabled}
      hasImageAttached={hasImageAttached}
      inputPreview={inputPreview}
      live={live}
      onRun={onRun}
      onRunAgain={onRunAgain}
      primaryHref={primaryHref}
      run={run}
      showModels={showModels}
      showProvider={showProvider}
      view={view}
      zap={zap}
    />
  );
}

function ZapHeroCard({
  className,
  disabled,
  hasImageAttached,
  inputPreview,
  live,
  onRun,
  onRunAgain,
  primaryHref,
  run,
  showModels,
  showProvider,
  view,
  zap,
}: {
  readonly className?: string;
  readonly disabled: boolean;
  readonly hasImageAttached: boolean;
  readonly inputPreview?: Record<string, string>;
  readonly live: boolean;
  readonly onRun?: () => void;
  readonly onRunAgain?: () => void;
  readonly primaryHref?: string;
  readonly run?: ZapCardRun | null;
  readonly showModels: boolean;
  readonly showProvider: boolean;
  readonly view: ZapCardView;
  readonly zap: PublicZapSpec;
}) {
  const [showAura, setShowAura] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [thumb, setThumb] = useState<"up" | "down" | null>(null);
  const previewItems = buildPreviewItems(zap, inputPreview);
  const playableUrl = view.outputUrl ?? "";
  const shareTargets: Array<{ icon: ComponentType<{ className?: string }>; key: string; label: string }> = [
    { icon: Share2, key: "native", label: "Native" },
    { icon: Copy, key: "url", label: "URL" },
    { icon: ExternalLink, key: "embed", label: "Embed" },
  ];

  async function handleShare(label: string) {
    const url = view.outputUrl ?? `${window.location.origin}/${zap.zap}`;
    if (label === "native" && navigator.share) {
      await navigator.share({ text: `${zap.title} generated with Zap`, title: zap.title, url });
      setShareToast("Shared");
      return;
    }
    await navigator.clipboard?.writeText(url);
    setShareToast(`${label} copied`);
    window.setTimeout(() => setShareToast(""), 1600);
  }

  function submitFeedback() {
    try {
      const prior = JSON.parse(window.localStorage.getItem("zap.feedback") ?? "[]") as unknown[];
      const next = [
        ...prior.slice(-19),
        {
          comment: feedbackText,
          createdAt: new Date().toISOString(),
          runId: run?.runId ?? "preview",
          vote: thumb ?? "neutral",
          zap: zap.zap,
        },
      ];
      window.localStorage.setItem("zap.feedback", JSON.stringify(next));
    } catch {
      // Local feedback is a convenience path; failing to store it should not block the creator.
    }
    setFeedbackSent(true);
    window.setTimeout(() => setShowFeedback(false), 1400);
  }

  return (
    <article className={cn("zap-card-shell relative overflow-hidden", className)}>
      <div className={cn("zap-card-media relative min-h-[288px] overflow-hidden", view.scene === "flash" ? "zap-card-flash" : "zap-card-stadium")}>
        <div className="zap-card-scanlines absolute inset-0" />

        {view.state !== "done" ? (
          <Image
            alt="Zap lightning mark"
            className="zap-card-float absolute top-5 right-6 h-[235px] w-[157px] object-cover object-center opacity-95 brightness-125 drop-shadow-[0_0_22px_rgba(0,229,255,0.45)]"
            height={235}
            priority
            src="/zaplogo.png"
            width={157}
          />
        ) : null}

        <div className="absolute top-3 right-3 left-3 z-20 flex items-start justify-between gap-3">
          <div className="flex max-w-[62%] flex-wrap gap-2">
            {showProvider ? <ZapChip>{view.provider}</ZapChip> : null}
            {showModels ? <ZapChip muted>{view.models}</ZapChip> : null}
          </div>
          <div className="flex gap-2">
            {view.state === "done" ? (
              <button className="zap-card-pill-primary" onClick={() => { setShowShare(true); setShowAura(false); }} type="button">
                <Share2 className="size-3.5" />
                Share
              </button>
            ) : null}
            <button className="zap-card-pill" onClick={() => { setShowAura((current) => !current); setShowShare(false); }} type="button">
              <Activity className="size-3.5" />
              Aura
            </button>
          </div>
        </div>

        {view.state === "running" ? (
          <div className="absolute inset-0 z-10 bg-[#030609]/60 backdrop-blur-[1.5px]">
            <div className="zap-card-scan-beam absolute right-0 left-0 h-14" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <p className="zap-card-pulse font-mono text-[11px] tracking-[0.22em] text-[#7d8f9b] uppercase">generating</p>
              <p className="font-semibold text-3xl text-white">{view.currentStepId}</p>
              <p className="font-mono text-sm text-[#00e5ff] drop-shadow-[0_0_12px_rgba(0,229,255,0.5)]">{view.spinner}</p>
            </div>
          </div>
        ) : null}

        {view.state === "done" ? (
          <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#030609]/25 to-[#030609]/75">
            {playableUrl ? (
              <video className="h-full w-full object-cover" controls src={playableUrl} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex size-16 items-center justify-center rounded-full border border-[#00e5ff]/80 bg-[#00141a]/70 shadow-[0_0_34px_rgba(0,229,255,0.35)]">
                  <Play className="ml-1 size-7 fill-[#00e5ff] text-[#00e5ff]" />
                </div>
              </div>
            )}
            <div className="absolute right-4 bottom-3 left-4 grid gap-2">
              <div className="h-1 rounded bg-white/20">
                <div className="h-full rounded bg-[#00e5ff]" style={{ width: "100%" }} />
              </div>
              <div className="flex justify-between gap-3 font-mono text-[10px] text-[#9db2be]">
                <span>00:00 / {view.durationLabel}</span>
                <span className="text-[#00e5ff]">{zap.output} / 1080p</span>
              </div>
            </div>
          </div>
        ) : null}

        {view.state !== "done" ? (
          <div className="absolute right-[112px] bottom-4 left-4 z-10">
            <p className="mb-1 font-mono text-[10px] tracking-[0.18em] text-[#00e5ff] uppercase">zap / {zap.zap}</p>
            <h2 className="text-balance font-semibold text-[clamp(1.55rem,4vw,2rem)] text-white leading-[1.08] tracking-normal drop-shadow-[0_2px_18px_rgba(0,0,0,0.8)]">
              {zap.title}
            </h2>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 p-4 md:p-5">
        <p className="text-[13px] text-[#8fa4b0] leading-6">{zap.description}</p>
        <div className="flex flex-wrap gap-2">
          <ZapChip active>est ${view.estimate} / cap ${view.cap}</ZapChip>
          <ZapChip muted>{view.stepsLabel}</ZapChip>
          <ZapChip muted>{view.durationLabel} output</ZapChip>
          <ZapChip muted>{live ? "live providers" : "plan safe"}</ZapChip>
        </div>

        {view.state === "idle" || view.state === "error" ? (
          <div className="grid gap-3">
            <div className={cn("flex min-h-11 items-center gap-3 rounded-md border border-dashed px-3 py-2", hasImageAttached ? "border-[#00e5ff]/45 bg-[#00e5ff]/5" : "border-[#00e5ff]/25 bg-[#00e5ff]/[0.03]")}>
              <Sparkles className="size-4 text-[#00e5ff]" />
              <span className="text-[11px] text-[#8fa4b0]">{hasImageAttached ? "reference image attached" : view.imagePrompt}</span>
              {hasImageAttached ? <CheckCircle2 className="ml-auto size-4 text-[#00e5ff]" /> : null}
            </div>
            {previewItems.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {previewItems.map((item) => (
                  <div className="rounded-md border border-white/10 px-3 py-2" key={item.label}>
                    <p className="mb-1 font-mono text-[8.5px] tracking-[0.14em] text-[#55646e] uppercase">{item.label}</p>
                    <p className="truncate text-[12px] text-[#dbe9f0]">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {view.state === "error" ? (
              <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-red-100 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{view.error}</span>
              </div>
            ) : null}
            {onRun ? (
              <button className="zap-card-run-button" disabled={disabled} onClick={onRun} type="button">
                <Zap className="size-4" />
                {live ? "Run live Zap" : "Plan Zap"}
              </button>
            ) : primaryHref ? (
              <Link className="zap-card-run-button" href={primaryHref}>
                <Zap className="size-4" />
                Run Zap
              </Link>
            ) : null}
          </div>
        ) : null}

        {view.state === "running" ? (
          <div className="zap-card-pulse flex h-12 items-center justify-center rounded-md border border-[#00e5ff]/25 bg-[#00e5ff]/[0.04] font-mono text-[12px] text-[#00e5ff] tracking-[0.06em]">
            running - metering live cost
          </div>
        ) : null}

        {view.state === "done" ? (
          <div className="grid gap-3">
            <div className="flex min-h-11 items-center gap-2 rounded-md border border-[#00e5ff]/30 bg-[#00e5ff]/5 px-3 py-2">
              <CheckCircle2 className="size-4 text-[#00e5ff]" />
              <span className="text-[11.5px] text-[#dbe9f0]">{zap.output} ready / {view.totalCostLabel} / {view.totalTimeLabel}</span>
              <button className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] text-[#9db2be] transition hover:border-white/30 hover:text-white" onClick={onRunAgain} type="button">
                <RefreshCw className="size-3" />
                Again
              </button>
            </div>
            <div className="relative flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] text-[#55646e]">rate output for the judge</span>
              <div className="ml-auto flex gap-2">
                <button className={cn("zap-card-feedback-button", thumb === "up" && "border-[#00e5ff]/60 bg-[#00e5ff]/15 text-[#00e5ff]")} onClick={() => { setThumb("up"); setShowFeedback(true); setFeedbackSent(false); }} type="button">
                  <ThumbsUp className="size-3.5" />
                  Good
                </button>
                <button className={cn("zap-card-feedback-button", thumb === "down" && "border-red-400/60 bg-red-400/10 text-red-200")} onClick={() => { setThumb("down"); setShowFeedback(true); setFeedbackSent(false); }} type="button">
                  <ThumbsDown className="size-3.5" />
                  Off
                </button>
              </div>
              {showFeedback ? (
                <div className="absolute right-0 bottom-10 z-40 w-[min(272px,calc(100vw-2rem))] rounded-md border border-[#00e5ff]/30 bg-[#0c1218] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
                  {feedbackSent ? (
                    <p className="py-2 text-[11px] text-[#00e5ff]">Captured for review.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-[10.5px] text-[#00e5ff]">RLHF note</p>
                      <textarea
                        className="h-16 w-full resize-none rounded-md border border-white/10 bg-white/[0.04] p-2 font-mono text-[11px] text-[#dbe9f0] outline-none"
                        onChange={(event) => setFeedbackText(event.target.value)}
                        placeholder="What should the judge learn?"
                        value={feedbackText}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button className="border-0 bg-transparent px-2 py-1 font-mono text-[10px] text-[#7d8f9b]" onClick={() => setShowFeedback(false)} type="button">Skip</button>
                        <button className="rounded-full bg-[#00e5ff] px-3 py-1 font-mono font-semibold text-[#001318] text-[10px]" onClick={submitFeedback} type="button">Log</button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 border-white/10 border-t bg-black/30 px-4 py-3 md:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9px] text-[#55646e] tracking-[0.2em] uppercase">generation process</span>
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-[#9db2be]">{view.elapsedLabel}</span>
            <span className="text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.4)]">{view.costLabel}</span>
          </div>
        </div>
        <SegmentBar segments={view.segments} />
        <div className="flex justify-between gap-3 font-mono text-[10.5px]">
          <span className="truncate text-[#7d8f9b]">{view.statusLine}</span>
          <span className="shrink-0 text-[#55646e]">{view.stepCounter}</span>
        </div>
      </div>

      {showAura ? (
        <div className="absolute top-13 right-3 z-40 w-[min(272px,calc(100vw-2rem))] rounded-md border border-[#00e5ff]/35 bg-[#0c1218] p-3 shadow-[0_22px_60px_rgba(0,0,0,0.65),0_0_40px_rgba(0,229,255,0.08)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-mono text-[10.5px] text-[#00e5ff] tracking-[0.08em]">
              <Activity className="size-3.5" />
              Aura
            </span>
            <button className="text-[#55646e] transition hover:text-white" onClick={() => setShowAura(false)} type="button"><X className="size-4" /></button>
          </div>
          {view.state === "done" ? (
            <div className="grid gap-2">
              {view.auraScores.map((score) => (
                <div key={score.label}>
                  <div className="mb-1 flex justify-between font-mono text-[10px] text-[#9db2be]">
                    <span>{score.label}</span>
                    <span className="text-[#00e5ff]">{score.value}</span>
                  </div>
                  <div className="h-1 rounded bg-white/10">
                    <div className="h-full rounded bg-[#00e5ff]" style={{ width: `${score.percent}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-white/10 border-t border-dashed pt-2 font-mono text-[10px]">
                <span className="text-[#7d8f9b]">verdict</span>
                <span className="font-semibold text-[#00e5ff]">ship</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[#7d8f9b] leading-6">Run the Zap, then Aura scores shot consistency, identity lock, pacing, and virality.</p>
          )}
          <p className="mt-3 text-[9px] text-[#55646e]">Scored after finalize.</p>
        </div>
      ) : null}

      {showShare ? (
        <div className="absolute inset-0 z-50 overflow-hidden rounded-md">
          <button aria-label="Close share sheet" className="absolute inset-0 bg-[#020407]/70 backdrop-blur-sm" onClick={() => setShowShare(false)} type="button" />
          <div className="absolute top-1/2 left-1/2 w-[min(304px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#00e5ff]/35 bg-[#0c1218] p-4 shadow-[0_26px_70px_rgba(0,0,0,0.7)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] text-[#dbe9f0] tracking-[0.05em]">share {zap.output}</span>
              <button className="text-[#55646e] transition hover:text-white" onClick={() => setShowShare(false)} type="button"><X className="size-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {shareTargets.map(({ icon: Icon, key, label }) => (
                <button className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-3 text-center font-mono text-[10px] text-[#9db2be] transition hover:border-[#00e5ff]/50 hover:bg-[#00e5ff]/[0.06] hover:text-white" key={key} onClick={() => handleShare(key)} type="button">
                  <Icon className="mx-auto size-4 text-[#00e5ff]" />
                  {label}
                </button>
              ))}
            </div>
            {shareToast ? <p className="mt-3 text-center font-mono text-[10px] text-[#00e5ff]">{shareToast}</p> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

type ZapCardView = {
  readonly auraScores: Array<{ label: string; percent: number; value: string }>;
  readonly cap: string;
  readonly costLabel: string;
  readonly currentStepId: string;
  readonly durationLabel: string;
  readonly elapsedLabel: string;
  readonly error: string;
  readonly estimate: string;
  readonly imagePrompt: string;
  readonly models: string;
  readonly outputUrl?: string;
  readonly provider: string;
  readonly scene: "flash" | "stadium";
  readonly segments: Array<{ flex: number; key: string; percent: number }>;
  readonly spinner: string;
  readonly state: ZapCardState;
  readonly statusLine: string;
  readonly stepCounter: string;
  readonly stepsLabel: string;
  readonly totalCostLabel: string;
  readonly totalTimeLabel: string;
};

function useZapCardView(zap: PublicZapSpec, run?: ZapCardRun | null, forcedState?: ZapCardState, error?: string | null): ZapCardView {
  return useMemo(() => {
    const derivedState = forcedState ?? deriveState(run, error);
    const activeIndex = findActiveStepIndex(zap.steps, run?.stage);
    const totalDuration = totalDurationSeconds(zap.steps);
    const runProgress = clamp(run?.progress ?? (derivedState === "running" ? 0.48 : derivedState === "done" ? 1 : 0), 0, 1);
    const segments = zap.steps.map((step, index) => {
      const stepPercent =
        derivedState === "done" ? 100 :
          derivedState === "running" && index < activeIndex ? 100 :
            derivedState === "running" && index === activeIndex ? Math.round(runProgress * 100) :
              0;
      return {
        flex: Math.max(1, Math.round(step.duration_s ?? durationGuess(step))),
        key: step.id,
        percent: stepPercent,
      };
    });
    const currentStep = zap.steps[activeIndex] ?? zap.steps[0];
    const provider = providerLabel(zap);
    const models = modelLabel(zap);
    const elapsedSeconds = Math.max(0, Math.round((run?.elapsedMs ?? 0) / 100) / 10);
    const costUsd = run?.costUsd ?? (derivedState === "done" ? 0 : 0);
    const totalCost = run?.costUsd ?? (derivedState === "done" ? 0 : zap.budget.estimate_usd);
    const statusLine = statusFor(derivedState, run, currentStep, zap);
    const stepCounter = derivedState === "idle" || derivedState === "error"
      ? `est ${Math.round(totalDuration)}s / $${zap.budget.estimate_usd.toFixed(2)}`
      : `${Math.min(activeIndex + 1, zap.steps.length)}/${zap.steps.length} ${currentStep?.id ?? "queued"}`;

    return {
      auraScores: [
        { label: "shot consistency", percent: 94, value: "0.94" },
        { label: "identity lock", percent: 91, value: "0.91" },
        { label: "pacing", percent: 88, value: "0.88" },
        { label: "virality", percent: 87, value: "87/100" },
      ],
      cap: zap.budget.cap_usd.toFixed(2),
      costLabel: `$${costUsd.toFixed(2)}`,
      currentStepId: currentStep?.id ?? "queued",
      durationLabel: `${Math.max(1, Math.round(totalDuration))}s`,
      elapsedLabel: formatElapsed(elapsedSeconds),
      error: error ?? run?.error ?? "Zap run failed.",
      estimate: zap.budget.estimate_usd.toFixed(2),
      imagePrompt: Object.values(zap.inputs).some((input) => input.type === "image") ? "attach a clear reference image" : "prompt inputs ready",
      models,
      outputUrl: run?.zapUrl,
      provider,
      scene: sceneFor(zap.zap),
      segments,
      spinner: `${Math.round(runProgress * 100)}%`,
      state: derivedState,
      statusLine,
      stepCounter,
      stepsLabel: `${zap.steps.length} steps`,
      totalCostLabel: `$${totalCost.toFixed(2)}`,
      totalTimeLabel: `${Math.max(1, Math.round(totalDuration * 10) / 10)}s`,
    };
  }, [error, forcedState, run, zap]);
}

function ZapChip({ active = false, children, className, muted = false }: { readonly active?: boolean; readonly children: ReactNode; readonly className?: string; readonly muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.05em]",
        active && "border-[#00e5ff]/35 bg-[#00e5ff]/[0.06] text-[#00e5ff]",
        muted && "border-white/10 bg-[#05080c]/70 text-[#7d8f9b]",
        !active && !muted && "border-white/10 bg-[#05080c]/70 text-[#9db2be] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SegmentBar({ compact = false, segments }: { readonly compact?: boolean; readonly segments: ZapCardView["segments"] }) {
  return (
    <div className={cn("flex gap-1", compact ? "h-[3px]" : "h-[5px]")}>
      {segments.map((segment) => (
        <div className="min-w-0 overflow-hidden rounded bg-white/[0.08]" key={segment.key} style={{ flexGrow: segment.flex, flexBasis: 0 }}>
          <div className="h-full rounded bg-gradient-to-r from-[#00b8d9] to-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.6)] transition-[width]" style={{ width: `${segment.percent}%` }} />
        </div>
      ))}
    </div>
  );
}

function deriveState(run?: ZapCardRun | null, error?: string | null): ZapCardState {
  if (error || run?.error || run?.status === "failed") return "error";
  if (run?.zapUrl || run?.status === "done") return "done";
  if (run?.status === "queued" || run?.status === "running" || run?.status === "waiting") return "running";
  return "idle";
}

function findActiveStepIndex(steps: readonly ZapStep[], stage?: string) {
  if (!stage) return 0;
  const index = steps.findIndex((step) => stage.includes(step.id) || step.id.includes(stage));
  return index === -1 ? 0 : index;
}

function totalDurationSeconds(steps: readonly ZapStep[]) {
  return steps.reduce((sum, step) => sum + durationGuess(step), 0);
}

function durationGuess(step: ZapStep) {
  if (step.duration_s) return step.duration_s;
  if (step.kind.startsWith("image.")) return 2;
  if (step.kind === "stitch" || step.kind === "keyframes") return 1.5;
  if (step.kind.startsWith("audio.")) return 3;
  return 6;
}

function providerLabel(zap: PublicZapSpec) {
  const providers = Array.from(new Set([zap.defaults.provider, ...zap.steps.map((step) => step.provider).filter(Boolean)]));
  return providers.join(" + ");
}

function modelLabel(zap: PublicZapSpec) {
  const models = Array.from(new Set(zap.steps.map((step) => step.model).filter(Boolean))).slice(0, 2);
  return models.length > 0 ? models.join(" / ") : "local";
}

function sceneFor(slug: string): "flash" | "stadium" {
  return slug.includes("caught") || slug.includes("cam") ? "flash" : "stadium";
}

function statusFor(state: ZapCardState, run: ZapCardRun | null | undefined, step: ZapStep | undefined, zap: PublicZapSpec) {
  if (state === "error") return run?.error ?? "run failed";
  if (state === "done") return "complete - every step metered";
  if (state === "running") return `${step?.id ?? "queued"} / ${step?.model ?? step?.kind ?? "provider"} / ${run?.stage ?? "running"}`;
  return `idle - ${Object.keys(zap.inputs).length} inputs / plan by default`;
}

function buildPreviewItems(zap: PublicZapSpec, inputPreview?: Record<string, string>) {
  const entries = Object.entries(inputPreview ?? {})
    .filter(([, value]) => value.trim().length > 0)
    .slice(0, 3)
    .map(([label, value]) => ({ label: label.toLowerCase(), value }));
  if (entries.length > 0) return entries;
  return Object.entries(zap.inputs)
    .filter(([, input]) => input.type !== "image")
    .slice(0, 3)
    .map(([label, input]) => ({ label: (input.label ?? label).toLowerCase(), value: input.hint ?? "waiting" }));
}

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${String(mins).padStart(2, "0")}:${secs}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
