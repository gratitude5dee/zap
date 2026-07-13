"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createThirdwebClient } from "thirdweb";
import { ConnectButton } from "thirdweb/react";
import { sanitizeNextPath } from "@/lib/zap-run-auth";

export function WalletSignInButton({
  clientId,
  label = "Sign In",
  resumePath,
}: {
  readonly clientId?: string;
  readonly label?: string;
  readonly resumePath?: string;
}) {
  const client = useMemo(() => clientId ? createThirdwebClient({ clientId }) : null, [clientId]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!client) {
    return (
      <Link
        className="inline-flex h-[50px] w-[165px] shrink-0 items-center justify-center rounded-md border border-white/15 px-3 text-sm text-white/70 hover:border-zap-cyan hover:text-white"
        href="/settings#thirdweb-setup"
        prefetch={false}
        title="Set NEXT_PUBLIC_THIRDWEB_CLIENT_ID to enable wallet sign-in"
      >
        {label}
      </Link>
    );
  }

  // thirdweb reads browser wallet state during render. Keep the server and the
  // first client render identical, then mount its interactive button.
  if (!mounted) {
    return <WalletSignInPlaceholder label={label} />;
  }

  return (
    <ConnectButton
      auth={{
        doLogin: async (params) => {
          const response = await fetch("/api/auth/wallet-proof", {
            body: JSON.stringify(params),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "Wallet sign-in failed.");
          if (resumePath) window.location.assign(sanitizeNextPath(resumePath));
        },
        doLogout: async () => {
          await fetch("/api/auth/logout", { method: "POST" });
        },
        getLoginPayload: async ({ address, chainId }) => {
          const response = await fetch("/api/auth/wallet-proof/payload", {
            body: JSON.stringify({ address, chainId }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "Could not prepare wallet sign-in.");
          return payload;
        },
        isLoggedIn: async (address) => {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          if (!response.ok) return false;
          const payload = await response.json();
          return payload.authenticated === true
            && String(payload.principal?.walletAddress ?? "").toLowerCase() === address.toLowerCase();
        },
      }}
      client={client}
      connectButton={{ label }}
      connectModal={{ showThirdwebBranding: false, title: "Sign in to Zap" }}
      detailsButton={{ displayBalanceToken: {} }}
      signInButton={{ label }}
      theme="dark"
    />
  );
}

export function WalletSignInPlaceholder({ label = "Sign In" }: { readonly label?: string }) {
  return (
    <button
      className="inline-flex h-[50px] w-[165px] shrink-0 items-center justify-center rounded-md border border-white/15 bg-white px-3 text-sm text-black disabled:cursor-wait disabled:opacity-90"
      disabled
      type="button"
    >
      {label}
    </button>
  );
}
