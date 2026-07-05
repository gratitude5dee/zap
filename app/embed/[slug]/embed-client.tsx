"use client";

import { useEffect } from "react";
import type { PublicZapSpec } from "@/lib/zap-schema";
import { ZapRunner } from "@/app/zap/[slug]/zap-runner";

export function EmbedClient({ zap }: { readonly zap: PublicZapSpec }) {
  useEffect(() => {
    const post = (type: string, payload: Record<string, unknown> = {}) => {
      window.parent.postMessage({ ...payload, type, v: 1, zap: zap.zap }, "*");
    };
    post("ready");
    const observer = new ResizeObserver(([entry]) => {
      if (entry) post("resize", { height: Math.ceil(entry.contentRect.height) });
    });
    observer.observe(document.body);
    const onMessage = (event: MessageEvent) => {
      if (!event.data || event.data.v !== 1) return;
      if (event.data.type === "run") post("run:queued");
      if (event.data.type === "theme") document.documentElement.dataset.theme = String(event.data.theme ?? "auto");
    };
    window.addEventListener("message", onMessage);
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
    };
  }, [zap.zap]);

  return <ZapRunner zap={zap} />;
}
