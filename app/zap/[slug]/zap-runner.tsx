"use client";

import { CheckCircle2, CircleDollarSign, Film, ImageIcon, Play, Upload, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { RunProgress } from "@/app/runs/[runId]/run-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
  const [run, setRun] = useState<RunResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textInputs = useMemo(
    () => Object.entries(zap.inputs).filter(([, input]) => input.type !== "image"),
    [zap.inputs],
  );
  const hasImage = Object.values(zap.inputs).some((input) => input.type === "image");

  async function handleSubmit() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/zaps/run", {
        body: JSON.stringify({
          extendCount,
          inputs: { ...values, image: imageDataUrl || undefined },
          slug: zap.zap,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as RunResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Zap run failed");
      }
      setRun(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zap run failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f7f7f2] text-zinc-950">
      <div className="mx-auto grid min-h-dvh w-full max-w-7xl grid-cols-1 lg:grid-cols-[390px_1fr]">
        <aside className="border-zinc-200 border-r bg-white/80 px-5 py-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
              <WandSparkles className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-lg leading-tight">Zap</p>
              <p className="text-zinc-500 text-xs">Eve generative recipe runner</p>
            </div>
          </div>

          <section className="mt-8 space-y-2">
            <h1 className="font-semibold text-3xl tracking-normal">{zap.title}</h1>
            <p className="text-sm text-zinc-600 leading-6">{zap.description}</p>
          </section>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <Metric icon={<CircleDollarSign className="size-4" />} label="Estimate" value={`$${zap.budget.estimate_usd.toFixed(2)}`} />
            <Metric icon={<Film className="size-4" />} label="Steps" value={String(zap.steps.length)} />
            <Metric icon={<CheckCircle2 className="size-4" />} label="Cap" value={`$${zap.budget.cap_usd}`} />
          </div>

          <div className="mt-7 space-y-4">
            {hasImage ? (
              <label className="block">
                <span className="mb-2 block font-medium text-sm">Selfie / reference image</span>
                <div className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-zinc-50 px-4 py-5 text-center transition hover:bg-zinc-100", imageDataUrl && "border-emerald-400 bg-emerald-50")}>
                  <Upload className="mb-2 size-5 text-zinc-500" />
                  <span className="text-sm text-zinc-600">{imageDataUrl ? "Image attached" : "Upload a clear front-facing image"}</span>
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
                <span className="mb-2 block font-medium text-sm">{input.label ?? name}</span>
                {input.type === "textarea" ? (
                  <Textarea value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={input.hint} />
                ) : (
                  <Input value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={input.hint} />
                )}
              </label>
            ))}

            <label className="block">
              <span className="mb-2 block font-medium text-sm">Extend segments</span>
              <Input max={64} min={0} onChange={(event) => setExtendCount(Number(event.target.value))} type="number" value={extendCount} />
            </label>

            <Button className="h-11 w-full gap-2" disabled={isRunning} onClick={handleSubmit}>
              <Play className="size-4" />
              {isRunning ? "Running Zap..." : "Run Zap"}
            </Button>
            {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">{error}</p> : null}
          </div>
        </aside>

        <section className="min-w-0 px-5 py-5 lg:px-8">
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="min-h-[420px] rounded-lg border bg-zinc-950 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-xl">Output</h2>
                  <p className="text-sm text-zinc-400">Final video and live run state land here.</p>
                </div>
                <ImageIcon className="size-5 text-zinc-400" />
              </div>
              {run?.zapUrl ? (
                <video className="mt-5 aspect-video w-full rounded-md bg-black" controls src={run.zapUrl} />
              ) : (
                <div className="mt-5 flex aspect-video items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400">
                  Waiting for Zap.mp4
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h2 className="font-semibold">Stage Timeline</h2>
              <div className="mt-4 space-y-3">
                {zap.steps.map((step) => (
                  <div className="rounded-md border bg-zinc-50 px-3 py-2" key={step.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-sm">{step.id}</span>
                      <span className="rounded bg-white px-2 py-1 text-[11px] text-zinc-500">{step.kind}</span>
                    </div>
                    <p className="mt-1 truncate text-zinc-500 text-xs">{step.model ?? "local"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {run ? (
            <div className="mt-4 rounded-lg border bg-white p-4">
              <RunProgress fallbackStatus={run.status} runId={run.runId} />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border bg-zinc-50 p-3">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-[11px] uppercase">{label}</span>
      </div>
      <p className="mt-2 font-semibold text-sm">{value}</p>
    </div>
  );
}
