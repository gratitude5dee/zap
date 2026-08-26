"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CopyCommandCtaProps = {
  readonly command: string;
};

export function CopyCommandCta({ command }: CopyCommandCtaProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; leave button state unchanged
    }
  };

  return (
    <button
      aria-label={`Copy command: ${command}`}
      className="zap-glass-cta zap-glass-cta--glass"
      onClick={copy}
      type="button"
    >
      <span aria-hidden className="zap-glass-cta__beam" />
      <span aria-hidden className="zap-glass-cta__pane" />
      <span className="zap-glass-cta__label font-mono text-[13px] sm:text-sm">
        <span className="max-w-[70vw] truncate">{command}</span>
        {copied ? (
          <Check aria-hidden className="size-4 shrink-0 text-[#a7f36b]" />
        ) : (
          <Copy aria-hidden className="size-4 shrink-0" />
        )}
        <span aria-live="polite" className="sr-only">
          {copied ? "Copied to clipboard" : ""}
        </span>
      </span>
    </button>
  );
}
