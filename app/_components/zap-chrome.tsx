import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, Plug, Settings, Sparkles, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";

const navItems = [
  { href: "/openintuition", icon: Sparkles, label: "OpenIntuition" },
  { href: ZAP_DOCS_URL, icon: BookOpen, label: "Docs" },
  { href: "/providers", icon: Plug, label: "Providers" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function ZapLogo({ className = "", compact = false }: { readonly className?: string; readonly compact?: boolean }) {
  return (
    <Link className={cn("group inline-flex min-h-11 items-center gap-3", className)} href="/" prefetch={false}>
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zap-ink shadow-[0_0_24px_rgba(40,138,255,0.22)]">
        <Image
          alt="Zap lightning mark"
          className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-110"
          height={80}
          src="/zaplogo.png"
          width={80}
        />
      </span>
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="font-semibold text-[17px] text-zap-ink">Zap</span>
          <span className="mt-1 text-[11px] text-zap-muted">composable CPU agent runtime</span>
        </span>
      )}
    </Link>
  );
}

export function SiteNav({ tone = "light" }: { readonly tone?: "light" | "dark" }) {
  const isDark = tone === "dark";
  return (
    <nav className="flex min-h-14 items-center justify-between gap-4">
      <ZapLogo
        className={isDark ? "[&_*]:text-white" : ""}
      />
      <div className="flex items-center gap-1">
        {navItems.map((item) => (
          <Link
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm transition sm:justify-start sm:px-3",
              isDark
                ? "text-white/70 hover:bg-white/10 hover:text-white"
                : "text-zap-muted hover:bg-zap-fog hover:text-zap-ink",
            )}
            aria-label={item.label}
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            <item.icon className="size-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        ))}
        <Link
          className="zap-glass-pill min-h-11 px-4 font-medium text-sm"
          href="/studio"
          prefetch={false}
        >
          <TerminalSquare className="size-4" />
          Studio
        </Link>
      </div>
    </nav>
  );
}

export function PageShell({
  children,
  className = "",
  tone = "light",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: "light" | "dark";
}) {
  return (
    <main className={cn(tone === "dark" ? "min-h-dvh bg-zap-ink/75 text-white" : "min-h-dvh bg-zap-paper text-zap-ink", className)}>
      {children}
    </main>
  );
}

export function Eyebrow({ children, tone = "blue" }: { readonly children: ReactNode; readonly tone?: "blue" | "amber" | "neutral" }) {
  return (
    <p
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-md border px-3 py-1 font-medium text-sm",
        tone === "blue" && "border-zap-blue/25 bg-zap-blue/10 text-zap-blue",
        tone === "amber" && "border-zap-amber/30 bg-zap-amber/15 text-zap-amber-ink",
        tone === "neutral" && "border-zap-line bg-white text-zap-muted",
      )}
    >
      {children}
    </p>
  );
}

export function TextLink({ children, href }: { readonly children: ReactNode; readonly href: string }) {
  return (
    <Link className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 font-medium text-sm text-zap-ink underline decoration-zap-blue/35 underline-offset-4 hover:text-zap-blue" href={href} prefetch={false}>
      {children}
      <ArrowUpRight className="size-4" />
    </Link>
  );
}

export function CodeWindow({
  children,
  label,
  status,
}: {
  readonly children: string;
  readonly label: string;
  readonly status?: string;
}) {
  return (
    <div className="zap-gradient-frame overflow-hidden rounded-md text-white shadow-[0_24px_70px_rgba(2,8,23,0.32)]">
      <div className="flex min-h-12 items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-zap-ember" />
          <span className="size-2 rounded-full bg-zap-amber" />
          <span className="size-2 rounded-full bg-zap-blue" />
          <span className="ml-2 font-mono text-[12px] text-white/60">{label}</span>
        </div>
        {status ? <span className="rounded-md bg-zap-blue/15 px-2 py-1 font-mono text-[11px] text-blue-100">{status}</span> : null}
      </div>
      <div aria-hidden className="zap-hairline" />
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-zinc-200"><code>{children}</code></pre>
    </div>
  );
}
