"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { sanitizeNextPath } from "@/lib/zap-run-auth";
import { WalletSignInButton, WalletSignInPlaceholder } from "./wallet-sign-in-button";

export function SiteHeader({ clientId }: { readonly clientId?: string }) {
  return (
    <header className="sticky top-0 z-50 border-white/10 border-b bg-[#07090d]/95 text-white shadow-lg backdrop-blur">
      <div className="zap-site-header-inner mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 px-4 py-2 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0 lg:px-8">
        <Link className="flex min-h-11 shrink-0 items-center gap-2.5" href="/" prefetch={false}>
          <span className="relative flex size-9 overflow-hidden rounded-md border border-white/15 bg-black">
            <Image alt="Zap" className="object-cover" fill sizes="36px" src="/zaplogo.png" />
          </span>
          <span className="font-semibold tracking-tight">Zap</span>
        </Link>
        <nav aria-label="Primary" className="zap-site-primary-nav flex items-center gap-1 text-sm">
          <HeaderLink href="/gallery">Gallery</HeaderLink>
          <HeaderLink href="/docs">Docs</HeaderLink>
          <HeaderLink href="/studio">Studio</HeaderLink>
        </nav>
        <div className="zap-site-auth">
          <Suspense fallback={<WalletSignInPlaceholder />}>
            <HeaderAuth clientId={clientId} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

function HeaderAuth({ clientId }: { readonly clientId?: string }) {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  return (
    <WalletSignInButton
      clientId={clientId}
      label={searchParams.get("signin") ? "Sign In to Continue" : "Sign In"}
      resumePath={nextPath ? sanitizeNextPath(nextPath) : undefined}
    />
  );
}

function HeaderLink({ children, href }: { readonly children: string; readonly href: string }) {
  return (
    <Link className="inline-flex min-h-10 items-center rounded-md px-2.5 text-white/58 transition hover:bg-white/10 hover:text-white" href={href} prefetch={false}>
      {children}
    </Link>
  );
}
