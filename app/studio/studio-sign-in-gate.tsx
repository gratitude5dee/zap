import Link from "next/link";
import { LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { WalletSignInButton } from "@/app/_components/wallet-sign-in-button";

export function StudioSignInGate({ clientId }: { readonly clientId?: string }) {
  return (
    <main className="zap-studio-min-height flex items-center justify-center bg-zap-ink px-5 py-16 text-white">
      <section className="zap-gradient-card w-full max-w-2xl overflow-hidden rounded-xl shadow-2xl">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(0,229,255,0.14),transparent_48%)] p-7 sm:p-10">
          <span className="inline-flex size-12 items-center justify-center rounded-lg border border-zap-cyan/30 bg-zap-cyan/10 text-zap-cyan">
            <LockKeyhole className="size-6" />
          </span>
          <p className="mt-6 font-mono text-xs tracking-[0.18em] text-zap-cyan uppercase">Owner-scoped workspace</p>
          <h1 className="mt-3 text-balance font-semibold text-4xl tracking-tight">Compose, deploy, and operate from one control room.</h1>
          <p className="mt-4 max-w-xl text-pretty leading-7 text-white/65">
            Build runtimes, author agents, inspect deployments and sessions, manage declared connections, and approve live spend without losing the execution trail. Gallery browsing and plan-only runs stay public.
          </p>
        </div>
        <div aria-hidden className="zap-hairline" />
        <div className="grid gap-6 p-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-10">
          <div className="grid gap-3 text-sm text-white/65">
            <p className="flex items-center gap-2"><WalletCards className="size-4 text-zap-cyan" /> Sign once with your thirdweb wallet.</p>
            <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-zap-cyan" /> Provider secrets are write-only after storage and masked everywhere.</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <WalletSignInButton clientId={clientId} label="Continue with wallet" resumePath="/studio" />
            <Link className="text-sm text-white/45 underline-offset-4 hover:text-white hover:underline" href="/gallery" prefetch={false}>
              Browse the gallery instead
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
