"use client";

import { CheckCircle2, CircleDollarSign, Film, TerminalSquare, Upload, WandSparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { RunProgress } from "@/app/runs/[runId]/run-progress";
import { ZapCard, type ZapCardState } from "@/app/_components/zap-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toZapErrorMessage } from "@/lib/zap-errors";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";
import type { PublicZapSpec } from "@/lib/zap-schema";

type RunResponse = {
  message?: string;
  runId: string;
  status: string;
  zapUrl?: string;
};

export function ZapRunner({ zap }: { readonly zap: PublicZapSpec }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [extendCount, setExtendCount] = useState(0);
  const [live, setLive] = useState(false);
  const [credentialMode, setCredentialMode] = useState<"byok" | "wzrd-cloud">("byok");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textInputs = useMemo(
    () => Object.entries(zap.inputs).filter(([, input]) => input.type !== "image"),
    [zap.inputs],
  );
  const hasImage = Object.values(zap.inputs).some((input) => input.type === "image");
  const cardState: ZapCardState = error ? "error" : isRunning ? "running" : run?.zapUrl || run?.status === "done" ? "done" : "idle";
  const cardRun = run ? { runId: run.runId, status: run.status, zapUrl: run.zapUrl } : isRunning ? { status: "running", stage: "queued" } : null;

  async function handleSubmit() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/zaps/run", {
        body: JSON.stringify({
          extendCount,
          credentialMode,
          inputs: { ...values, image: imageDataUrl || undefined },
          live,
          slug: zap.zap,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as RunResponse & { error?: unknown };
      if (!response.ok) {
        if (response.status === 401 && credentialMode === "wzrd-cloud") {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/?signin=1&next=${encodeURIComponent(next)}`);
          return;
        }
        throw new Error(toZapErrorMessage(payload.error));
      }
      setRun(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zap run failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="zap-metal-field min-h-dvh bg-zap-ink text-white">
      <div className="mx-auto grid min-h-dvh w-full max-w-7xl grid-cols-1 lg:grid-cols-[390px_1fr]">
        <aside className="border-white/10 border-r bg-black/25 px-5 py-5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link className="flex min-h-11 items-center gap-3" href="/" prefetch={false}>
              <span className="flex size-10 overflow-hidden rounded-md border border-white/15 bg-zap-ink">
                <Image alt="Zap" className="h-full w-full object-cover" height={64} src="/zaplogo.png" width={64} />
              </span>
              <span>
                <span className="block font-semibold text-lg leading-tight">Zap</span>
                <span className="text-white/45 text-xs">creator recipe runner</span>
              </span>
            </Link>
            <WandSparkles className="size-5 text-zap-cyan" />
          </div>

          <nav className="mt-5 flex gap-2 text-sm">
            <Link className="inline-flex min-h-10 items-center rounded-md px-3 text-white/55 transition hover:bg-white/10 hover:text-white" href="/gallery" prefetch={false}>Gallery</Link>
            <Link className="inline-flex min-h-10 items-center rounded-md px-3 text-white/55 transition hover:bg-white/10 hover:text-white" href={ZAP_DOCS_URL} prefetch={false}>Docs</Link>
            <Link className="inline-flex min-h-10 items-center rounded-md px-3 text-white/55 transition hover:bg-white/10 hover:text-white" href="/studio" prefetch={false}>Studio</Link>
          </nav>

          <section className="mt-7">
            <p className="font-mono text-xs text-zap-cyan">{zap.zap}</p>
            <h1 className="mt-2 font-semibold text-3xl leading-tight">{zap.title}</h1>
            <p className="mt-2 text-sm text-white/58 leading-6">{zap.description}</p>
          </section>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <Metric icon={<CircleDollarSign className="size-4" />} label="Estimate" value={`$${zap.budget.estimate_usd.toFixed(2)}`} />
            <Metric icon={<Film className="size-4" />} label="Steps" value={String(zap.steps.length)} />
            <Metric icon={<CheckCircle2 className="size-4" />} label="Cap" value={`$${zap.budget.cap_usd}`} />
          </div>

          <div className="mt-7 space-y-4">
            {hasImage ? (
              <label className="block">
                <span className="mb-2 block font-medium text-sm text-white/82">Selfie / reference image</span>
                <div className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/15 bg-white/[0.04] px-4 py-5 text-center transition hover:bg-white/[0.08]", imageDataUrl && "border-zap-cyan bg-zap-cyan/10")}>
                  <Upload className="mb-2 size-5 text-white/48" />
                  <span className="text-sm text-white/58">{imageDataUrl ? "Image attached" : "Upload a clear front-facing image"}</span>
                  <input
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setImageDataUrl(String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                    type="file"
                  />
                </div>
              </label>
            ) : null}

            {textInputs.map(([name, input]) => (
              <label className="block" key={name}>
                <span className="mb-2 block font-medium text-sm text-white/82">{input.label ?? name}</span>
                {input.type === "textarea" ? (
                  <Textarea className="border-white/15 bg-white/[0.04] text-white placeholder:text-white/35" onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={input.hint} value={values[name] ?? ""} />
                ) : (
                  <Input className="border-white/15 bg-white/[0.04] text-white placeholder:text-white/35" onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={input.hint} value={values[name] ?? ""} />
                )}
              </label>
            ))}

            <label className="block">
              <span className="mb-2 block font-medium text-sm text-white/82">Extend segments</span>
              <Input className="border-white/15 bg-white/[0.04] text-white" max={64} min={0} onChange={(event) => setExtendCount(Number(event.target.value))} type="number" value={extendCount} />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
              <span>
                <span className="block font-medium text-sm text-white">Live providers</span>
                <span className="text-white/45 text-xs">{live ? "Provider keys and budgets required" : "Plan only, zero spend"}</span>
              </span>
              <input
                checked={live}
                className="size-4 accent-zap-cyan"
                onChange={(event) => setLive(event.target.checked)}
                type="checkbox"
              />
            </label>

            {live ? (
              <label className="block">
                <span className="mb-2 block font-medium text-sm text-white/82">Credentials</span>
                <select
                  className="min-h-11 w-full rounded-md border border-white/15 bg-[#0b1016] px-3 text-sm text-white"
                  onChange={(event) => setCredentialMode(event.target.value as "byok" | "wzrd-cloud")}
                  value={credentialMode}
                >
                  <option value="byok">BYOK / self-hosted keys</option>
                  <option value="wzrd-cloud">WZRD Cloud hosted keys (wallet sign-in)</option>
                </select>
              </label>
            ) : null}

            <Button className="h-11 w-full gap-2 bg-zap-cyan text-zap-ink hover:bg-white" disabled={isRunning} onClick={handleSubmit}>
              <TerminalSquare className="size-4" />
              {isRunning
                ? "Running Zap..."
                : !live
                  ? "Plan Zap"
                  : credentialMode === "wzrd-cloud"
                    ? "Run Hosted Zap"
                    : "Run Live with BYOK"}
            </Button>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-5 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <ZapCard
              disabled={isRunning}
              error={error}
              hasImageAttached={Boolean(imageDataUrl)}
              inputPreview={values}
              live={live}
              onRun={handleSubmit}
              onRunAgain={() => {
                setError(null);
                setRun(null);
              }}
              run={cardRun}
              state={cardState}
              variant="hero"
              zap={zap}
            />

            <div className="mt-5 rounded-md border border-white/10 bg-black/25 p-4">
              <h2 className="font-semibold text-white">Stage Timeline</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {zap.steps.map((step) => (
                  <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2" key={step.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-sm text-white">{step.id}</span>
                      <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/50">{step.kind}</span>
                    </div>
                    <p className="mt-1 truncate text-white/45 text-xs">{step.model ?? "local"}</p>
                  </div>
                ))}
              </div>
            </div>

            {run ? (
              <div className="mt-5 rounded-md border border-white/10 bg-black/25 p-4">
                <RunProgress fallbackStatus={run.status} runId={run.runId} />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-white/48">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-2 font-semibold text-sm text-white">{value}</p>
    </div>
  );
}
