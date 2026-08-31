import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Boxes,
  Camera,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  Gamepad2,
  GraduationCap,
  KeyRound,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { CodeWindow, Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { CrtBackground } from "@/app/_components/threeui/crt-background";
import { GlassCta } from "@/app/_components/threeui/glass-cta";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";
import { ZAP_VERSION } from "@/lib/zap-version";

const FO_GUANG_PAPER_URL = "/foguang/foguang.pdf";
const FO_GUANG_SOURCE_URL = "https://github.com/gratitude5dee/zap/tree/main/packages/templates/zap-heavy-fo-guang";

const foGuangCommands = `zap harness bake zap-heavy-fo-guang    # plan-only
zap harness doctor zap-heavy-fo-guang`;

const composeSnippet = `createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-fo-guang", size: "large" })],
})`;

export const metadata: Metadata = {
  title: "fo-guang — the Zap robotics profile",
  description:
    "zap-heavy-fo-guang overlays zap-heavy with the Unitree G1 sim2sim stack: MuJoCo Playground training, ONNX policy playback, God's Eye View telemetry, and ABot-Recon reconstruction.",
};

export default function FoGuangPage() {
  return (
    <PageShell tone="dark">
      <section className="relative overflow-hidden bg-[#03100a]">
        <div className="absolute inset-0">
          <CrtBackground version={ZAP_VERSION} />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-5 lg:px-8">
          <SiteNav tone="dark" />
          <div className="grid gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.88fr)] lg:items-center lg:pb-20 lg:pt-16">
            <div className="max-w-3xl">
              <Eyebrow tone="amber">
                <Bot className="size-4" />
                zap-heavy-fo-guang · fo-guang robotics profile
              </Eyebrow>
              <h1 className="mt-5 text-balance font-semibold text-[clamp(3.25rem,9vw,6.5rem)] leading-[0.86] text-white tracking-[-0.04em]">
                Fo Guang.
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-xl leading-8 text-white/68">
                A humanoid robotics workbench in one template.{" "}
                <span className="font-mono text-zap-cyan">zap-heavy-fo-guang</span> overlays{" "}
                <span className="font-mono text-zap-cyan">zap-heavy</span> with the Unitree G1
                sim2sim stack: MuJoCo Playground MJX/PPO training, ONNX policy playback, the
                God&apos;s Eye View telemetry bridge, and ABot-Recon reconstruction from the G1
                head camera.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <GlassCta href={`${ZAP_DOCS_URL}/templates/zap-heavy-fo-guang`} tone="sulfur">
                  Read the template docs
                  <ArrowRight className="size-4" />
                </GlassCta>
                <a
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-5 font-medium text-white transition hover:bg-white/10"
                  href={FO_GUANG_PAPER_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <FileText className="size-4" />
                  Read Paper
                </a>
                <a
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-5 font-medium text-white transition hover:bg-white/10"
                  href={FO_GUANG_SOURCE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  View source
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </div>

            <div className="grid gap-4">
              <CodeWindow label="fork the robotics workbench" status="plan-safe">
                {foGuangCommands}
              </CodeWindow>
              <CodeWindow label="compose — zap.config.ts" status="compose">
                {composeSnippet}
              </CodeWindow>
            </div>
          </div>
        </div>
      </section>

      <section className="relative bg-[#05080c]/80 text-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <Eyebrow>
              <Workflow className="size-4" />
              The pipeline
            </Eyebrow>
            <h2 className="mt-5 text-balance font-semibold text-4xl leading-tight sm:text-5xl">
              Train, play back, stream, reconstruct.
            </h2>
            <p className="mt-5 text-pretty text-lg leading-8 text-white/62">
              One bake wires the full loop: a policy trained in simulation walks the G1, its
              telemetry streams out as RobotFrames, and the head camera feeds a dense 3D
              reconstruction — all inside the sandbox boundary.
            </p>
          </div>

          <ol className="mt-12 grid gap-4 lg:grid-cols-4">
            <FlowStep
              icon={<GraduationCap className="size-5" />}
              number="01"
              title="Train the policy"
              body="MuJoCo Playground trains a G1 joystick policy with MJX/PPO on flat and rough terrain, then exports it to ONNX."
            />
            <FlowStep
              icon={<Gamepad2 className="size-5" />}
              number="02"
              title="Play back sim2sim"
              body="The exported ONNX policy drives the G1 in the sim2sim player — a step that runs fine on CPU-only boxes."
            />
            <FlowStep
              icon={<Eye className="size-5" />}
              number="03"
              title="Stream telemetry"
              body="The God's Eye View bridge streams RobotFrames over a UNIX socket — inbound-only, with robot /command and /map disabled."
            />
            <FlowStep
              icon={<Camera className="size-5" />}
              number="04"
              title="Reconstruct the scene"
              body="ABot-Recon rebuilds dense 3D structure from the G1 head camera, with CPU inference and optional INT8 quantization."
            />
          </ol>
        </div>
      </section>

      <section className="relative bg-zap-ink/80 text-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <Eyebrow>
            <Cpu className="size-4" />
            GPU trains, CPU replays
          </Eyebrow>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1fr]">
            <h2 className="text-balance font-semibold text-4xl leading-tight">
              The bake detects the box and layers CUDA only where it helps.
            </h2>
            <p className="text-pretty leading-7 text-white/62">
              <span className="font-mono text-zap-cyan">bake.sh</span> probes{" "}
              <span className="font-mono text-zap-cyan">nvidia-smi</span> and layers{" "}
              <span className="font-mono text-zap-cyan">jax[cuda12]</span> only on GPU boxes;{" "}
              <span className="font-mono text-zap-cyan">FO_GUANG_CPU_ONLY=1</span> (or{" "}
              <span className="font-mono text-zap-cyan">=0</span>) overrides. MJX/PPO training
              needs the GPU lane; sim2sim playback and ABot-Recon inference run CPU-only, and
              the mode is recorded in <span className="font-mono text-zap-cyan">~/.zap/template.json</span>.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="zap-gradient-card rounded-md p-5">
              <p className="font-mono text-sm text-zap-cyan">gpu box</p>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Full workbench: MJX/PPO training, ONNX export, sim2sim playback, telemetry, and
                reconstruction.
              </p>
              <p className="mt-4 rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-white/50">
                jax[cuda12] layered over Playground&apos;s CPU JAX pin
              </p>
            </div>
            <div className="zap-gradient-card rounded-md p-5">
              <p className="font-mono text-sm text-zap-cyan">cpu-only box</p>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Replay and reconstruct: sim2sim playback of an exported policy plus ABot-Recon
                CPU inference, where INT8 quantization trades weight memory, not time.
              </p>
              <p className="mt-4 rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-white/50">
                cpuOptimized: true · no CUDA step
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative bg-[#05080c]/80 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:px-8 lg:py-20">
          <div>
            <Eyebrow tone="amber">
              <ShieldCheck className="size-4" />
              Invariants
            </Eyebrow>
            <h2 className="mt-5 max-w-3xl text-balance font-semibold text-4xl leading-tight sm:text-5xl">
              Inbound-only telemetry. Nothing secret is ever baked.
            </h2>
            <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-white/62">
              The overlay follows the same discipline as the rest of Zap: it is an overlay of{" "}
              <span className="font-mono text-zap-cyan">zap-heavy</span> (no named snapshot),
              every cloned repo and wheel is pinned and recorded, and{" "}
              <span className="font-mono text-zap-cyan">zap harness doctor</span> verifies the
              whole install — including that no credential landed on disk.
            </p>
          </div>

          <div className="grid content-start gap-3">
            <InvariantRow
              icon={<Eye className="size-5" />}
              title="Inbound-only telemetry"
              body="The bridge streams RobotFrames out to God's Eye View over a UNIX socket. Robot /command and /map stay disabled."
              detail="no hosted ports"
            />
            <InvariantRow
              icon={<KeyRound className="size-5" />}
              title="No baked secrets"
              body="GEV_ROBOT_INGEST_TOKEN and friends arrive at runtime through the BYOK/env allowlist only — never in the template or snapshot."
              detail="byok · runtime-only"
            />
            <InvariantRow
              icon={<Boxes className="size-5" />}
              title="Pinned and recorded"
              body="MuJoCo Playground, God's Eye View, and ABot-Recon are cloned at pinned refs; every ref and wheel version is written to ~/.zap/template.json."
              detail="recorded refs"
            />
          </div>
        </div>
      </section>

      <section className="relative bg-zap-ink/80 text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h2 className="font-semibold text-2xl leading-tight">Start with zero side effects.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/62">
                Bake is plan-only by default and doctor never spends. Nothing acquires a sandbox
                until you say so.
              </p>
            </div>
            <GlassCta href="/">
              Back to Zap
              <ArrowRight className="size-4" />
            </GlassCta>
          </div>
          <div className="mt-6 max-w-3xl">
            <CodeWindow label="safe first run" status="plan-safe">
              {foGuangCommands}
            </CodeWindow>
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

function InvariantRow({ body, detail, icon, title }: { readonly body: string; readonly detail: string; readonly icon: ReactNode; readonly title: string }) {
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
