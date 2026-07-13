"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, FilePlus2, Loader2, Rocket, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isStudioZapDraft, STUDIO_ZAP_DRAFT_EVENT } from "@/lib/studio-authoring";
import type { ZapRegistryEntry } from "@/lib/zap-registry";
import { SpriteWizard } from "./sprite-wizard";

const starterZap = `---
zap: my-new-zap
version: 2
description: A one-click creator recipe authored in Zap Studio.
inputs:
  PROMPT:
    type: textarea
    required: true
    label: Prompt
defaults:
  provider: fal
  models:
    image.gen: fal-ai/flux/dev
budget:
  estimate_usd: 0.05
  cap_usd: 1
steps:
  - id: hero
    kind: image.gen
    provider: fal
    model: fal-ai/flux/dev
    prompt: "Create a polished hero image for {PROMPT}"
output: Zap.png
---

# My New Zap
`;

type CatalogZap = { slug?: string; status?: string; title?: string; updatedAt?: number };

export function StudioRail({ templates }: { readonly templates: ZapRegistryEntry[] }) {
  const [catalog, setCatalog] = useState<CatalogZap[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [zapMd, setZapMd] = useState(starterZap);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refreshCatalog(); }, []);
  useEffect(() => {
    const openSavedDraft = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isStudioZapDraft(detail)) return;
      setZapMd(detail.markdown);
      setPrompts({});
      setEditorOpen(true);
      setMessage(`Loaded ${detail.slug} from Zap Operator.`);
    };
    window.addEventListener(STUDIO_ZAP_DRAFT_EVENT, openSavedDraft);
    return () => window.removeEventListener(STUDIO_ZAP_DRAFT_EVENT, openSavedDraft);
  }, []);

  async function refreshCatalog() {
    const response = await fetch("/api/studio/zaps", { cache: "no-store" });
    if (response.ok) setCatalog((await response.json()).zaps ?? []);
  }

  async function fork(slug: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/studio/fork", {
        body: JSON.stringify({ slug }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not fork template.");
      setZapMd(payload.zapMd);
      setPrompts(payload.prompts ?? {});
      setEditorOpen(true);
      setMessage(`Forked ${slug}. Edit the slug if you already have a copy.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not fork template.");
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/studio/validate", {
        body: JSON.stringify({ prompts, zapMd }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Validation failed.");
      setMessage(`Valid: ${payload.slug}, ${payload.steps} steps, est. $${Number(payload.estimateUsd).toFixed(2)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deploy() {
    setBusy(true);
    setMessage("");
    try {
      const validation = await fetch("/api/studio/validate", {
        body: JSON.stringify({ prompts, zapMd }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const validationPayload = await validation.json();
      if (!validation.ok) throw new Error(validationPayload.error ?? "Validation failed.");
      const response = await fetch("/api/zaps/publish", {
        body: JSON.stringify({ prompts, status: "published", zapMd }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Deployment failed.");
      setMessage(`Deployed private Zap ${payload.slug}.`);
      await refreshCatalog();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deployment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="zap-studio-rail relative overflow-y-auto bg-black/45 p-4 text-white">
      <div className="flex items-center justify-between gap-2">
        <div><h2 className="font-semibold text-sm">Creator catalog</h2><p className="text-white/45 text-xs">Private until curated.</p></div>
        <div className="flex gap-2">
          <SpriteWizard />
          <Button onClick={() => { setZapMd(starterZap); setPrompts({}); setEditorOpen(true); }} size="sm" variant="outline"><FilePlus2 className="size-4" /> New</Button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {catalog.length ? catalog.map((zap) => (
          <Link className="block rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm hover:border-zap-cyan/40" href={`/zap/${zap.slug}`} key={zap.slug} prefetch={false}>
            <b className="block truncate">{zap.title ?? zap.slug}</b><span className="text-white/45 text-xs">{zap.status}</span>
          </Link>
        )) : <p className="rounded-md border border-white/10 p-3 text-white/45 text-xs">No deployed zaps yet.</p>}
      </div>
      <h3 className="mt-6 font-semibold text-sm">Template gallery</h3>
      <div className="mt-3 space-y-2">
        {templates.map((template) => (
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3" key={template.slug}>
            <Link className="font-medium text-sm hover:text-zap-cyan" href={`/zap/${template.slug}`} prefetch={false}>{template.title}</Link>
            <p className="mt-1 line-clamp-2 text-white/45 text-xs">{template.description}</p>
            <div className="mt-2 flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-zap-cyan">${template.budget.estimate_usd.toFixed(2)}</span><button className="inline-flex items-center gap-1 text-white/60 text-xs hover:text-white" disabled={busy} onClick={() => void fork(template.slug)}><Copy className="size-3" /> Fork</button></div>
          </div>
        ))}
      </div>
      {editorOpen ? (
        <div className="fixed inset-0 z-[70] flex bg-black/75 p-4 backdrop-blur sm:p-8">
          <section className="mx-auto flex w-full max-w-4xl flex-col rounded-lg border border-white/15 bg-[#0a0f15] p-4 shadow-2xl">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold">Zap manifest editor</h2><p className="text-white/45 text-xs">CLI-parity parse and prompt checks run before deploy.</p></div><button aria-label="Close editor" onClick={() => setEditorOpen(false)}><X className="size-5" /></button></div>
            <Textarea className="mt-4 min-h-0 flex-1 resize-none border-white/15 bg-black/40 font-mono text-white text-xs" onChange={(event) => setZapMd(event.target.value)} value={zapMd} />
            {message ? <p className="mt-3 text-sm text-zap-cyan">{message}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button disabled={busy} onClick={() => void validate()} variant="outline">{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Validate</Button>
              <Button disabled={busy} onClick={() => void deploy()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Deploy privately</Button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
