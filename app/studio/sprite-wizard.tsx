"use client";

import {
  serializeSpriteMarkdown,
  SPRITE_WIZARD_STEPS,
  type SpriteSpec,
} from "@wzrdtech/core/sprite";
import { Boxes, ChevronLeft, ChevronRight, ExternalLink, Loader2, Rocket, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const stepDescriptions = {
  channels: "Choose the chat bindings that can reach this runtime.",
  connections: "Add one remote MCP server and optional plugin ids.",
  connectors: "Choose Composio productivity connector slugs.",
  model: "Choose the LLM route and model id.",
  sandbox: "Choose a predefined execution preset.",
  social: "Choose Composio social toolkit slugs.",
} as const;

export function SpriteWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState("my-world-cup-sprite");
  const [description, setDescription] = useState("My deployable World Cup media runtime.");
  const [sandbox, setSandbox] = useState<SpriteSpec["sandbox"]>("vercel-standard");
  const [route, setRoute] = useState<SpriteSpec["model"]["route"]>("gateway");
  const [modelId, setModelId] = useState("anthropic/claude-sonnet-4.6");
  const [mcpId, setMcpId] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [plugins, setPlugins] = useState("");
  const [connectors, setConnectors] = useState("");
  const [social, setSocial] = useState("");
  const [channels, setChannels] = useState<SpriteSpec["channels"]>(["slack"]);
  const activeStep = SPRITE_WIZARD_STEPS[step];

  function spec(): SpriteSpec {
    return {
      channels,
      connections: [
        ...(mcpId && mcpUrl ? [{ id: mcpId.trim(), kind: "mcp" as const, url: mcpUrl.trim() }] : []),
        ...csv(plugins).map((id) => ({ id, kind: "plugin" as const })),
      ],
      connectors: csv(connectors),
      description,
      model: { id: modelId, route },
      sandbox,
      social: csv(social),
      sprite: slug,
      version: 1,
      zaps: ["world-cup-entrance"],
    };
  }

  async function save(deploy: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const spriteMd = serializeSpriteMarkdown(spec());
      const response = await fetch(deploy ? "/api/studio/sprite/deploy" : "/api/studio/sprite", {
        body: JSON.stringify({ spriteMd }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sprite request failed.");
      setMessage(deploy
        ? `Deployment ${payload.status}. ${payload.deploymentUrl ?? "Status is available from this wizard."}`
        : "Sprite manifest validated and saved as a private draft.");
      if (deploy && payload.status !== "ready") void pollStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sprite request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pollStatus(attempt = 0) {
    if (attempt >= 20) return;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const response = await fetch("/api/studio/sprite/status", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) return;
    setMessage(`Deployment ${payload.status}.${payload.deploymentUrl ? ` ${payload.deploymentUrl}` : ""}`);
    if (payload.status === "deploying") void pollStatus(attempt + 1);
  }

  async function connect(toolkit: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/studio/sprite/connect", {
        body: JSON.stringify({ toolkit }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload.redirectUrl) throw new Error(payload.error ?? "Connector authorization failed.");
      window.location.assign(payload.redirectUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connector authorization failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline"><Boxes className="size-4" /> Sprite</Button>
      {open ? (
        <div className="fixed inset-0 z-[75] flex bg-black/80 p-4 backdrop-blur sm:p-8">
          <section className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0a0f15] text-white shadow-2xl">
            <header className="flex items-start justify-between border-white/10 border-b p-5">
              <div><p className="font-mono text-[10px] text-zap-cyan uppercase tracking-[0.2em]">Sprite alpha · one per wallet</p><h2 className="mt-1 font-semibold text-2xl">Compose a deployable runtime</h2></div>
              <button aria-label="Close Sprite wizard" onClick={() => setOpen(false)}><X className="size-5" /></button>
            </header>
            <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
              <nav className="border-white/10 border-r bg-black/25 p-4">
                {SPRITE_WIZARD_STEPS.map((name, index) => (
                  <button className={`mb-1 block w-full rounded px-3 py-2 text-left text-sm ${index === step ? "bg-zap-cyan text-black" : "text-white/55 hover:bg-white/5"}`} key={name} onClick={() => setStep(index)}>
                    <span className="mr-2 font-mono text-[10px]">{index + 1}</span>{name}
                  </button>
                ))}
              </nav>
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className="mb-1 block text-white/55 text-xs">Sprite slug</span><Input onChange={(event) => setSlug(event.target.value)} value={slug} /></label>
                  <label><span className="mb-1 block text-white/55 text-xs">Included Zap</span><Input disabled value="world-cup-entrance" /></label>
                </div>
                <label className="mt-3 block"><span className="mb-1 block text-white/55 text-xs">Description</span><Input onChange={(event) => setDescription(event.target.value)} value={description} /></label>
                <div className="my-5 border-white/10 border-t" />
                <h3 className="font-semibold text-xl capitalize">{activeStep}</h3>
                <p className="mt-1 text-sm text-white/45">{stepDescriptions[activeStep]}</p>
                <div className="mt-5">{renderStep(activeStep)}</div>
                {[...csv(connectors), ...csv(social)].length > 0 && step >= 3 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {[...csv(connectors), ...csv(social)].map((toolkit) => (
                      <Button disabled={busy} key={toolkit} onClick={() => void connect(toolkit)} size="sm" variant="outline">Connect {toolkit}<ExternalLink className="size-3" /></Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <footer className="border-white/10 border-t p-4">
              {message ? <p className="mb-3 text-sm text-zap-cyan">{message}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button disabled={step === 0 || busy} onClick={() => setStep((value) => value - 1)} variant="ghost"><ChevronLeft className="size-4" /> Previous</Button>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void save(false)} variant="outline">Save draft</Button>
                  {step < SPRITE_WIZARD_STEPS.length - 1 ? (
                    <Button onClick={() => setStep((value) => value + 1)}>Next <ChevronRight className="size-4" /></Button>
                  ) : (
                    <Button disabled={busy} onClick={() => void save(true)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Build & deploy</Button>
                  )}
                </div>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );

  function renderStep(name: (typeof SPRITE_WIZARD_STEPS)[number]) {
    switch (name) {
      case "sandbox":
        return <NativeSelect onChange={(value) => setSandbox(value as SpriteSpec["sandbox"])} options={["vercel-standard", "box-standard", "daytona-standard", "e2b-standard", "docker-local"]} value={sandbox} />;
      case "model":
        return <div className="grid gap-3 sm:grid-cols-2"><NativeSelect onChange={(value) => setRoute(value as SpriteSpec["model"]["route"])} options={["gateway", "openai", "anthropic", "openrouter"]} value={route} /><Input onChange={(event) => setModelId(event.target.value)} value={modelId} /></div>;
      case "connections":
        return <div className="grid gap-3"><Input onChange={(event) => setMcpId(event.target.value)} placeholder="MCP id (optional)" value={mcpId} /><Input onChange={(event) => setMcpUrl(event.target.value)} placeholder="https://…/mcp" type="url" value={mcpUrl} /><Input onChange={(event) => setPlugins(event.target.value)} placeholder="plugin ids, comma separated" value={plugins} /></div>;
      case "connectors":
        return <Textarea onChange={(event) => setConnectors(event.target.value)} placeholder="notion, gmail" value={connectors} />;
      case "social":
        return <Textarea onChange={(event) => setSocial(event.target.value)} placeholder="instagram, twitter" value={social} />;
      case "channels":
        return <div className="flex flex-wrap gap-2">{(["slack", "telegram", "imessage"] as const).map((channel) => <label className="flex items-center gap-2 rounded border border-white/15 px-3 py-2 text-sm" key={channel}><input checked={channels.includes(channel)} onChange={() => setChannels((current) => current.includes(channel) ? current.filter((value) => value !== channel) : [...current, channel])} type="checkbox" />{channel}</label>)}</div>;
    }
  }
}

function NativeSelect({ onChange, options, value }: { onChange(value: string): void; options: string[]; value: string }) {
  return <select className="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option}>{option}</option>)}</select>;
}

function csv(value: string) {
  return [...new Set(value.split(/[\n,]/).map((part) => part.trim().toLowerCase()).filter(Boolean))];
}
