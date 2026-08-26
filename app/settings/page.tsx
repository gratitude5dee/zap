import Link from "next/link";
import { SettingsClient } from "./settings-client";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { ZAP_DOCS_URL } from "@/lib/zap-urls";
import { zapSecretTypes } from "@/lib/supabase/secrets";
import { KeyRound } from "lucide-react";

export default function SettingsPage() {
  return (
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-6xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />
        <div className="mt-10 flex flex-col justify-between gap-4 pb-8 sm:flex-row sm:items-end">
          <div>
            <Eyebrow>
              <KeyRound className="size-4" />
              Vault
            </Eyebrow>
            <h1 className="mt-4 font-semibold text-5xl leading-none text-white">Creator Settings</h1>
            <p className="mt-4 max-w-2xl text-white/62 leading-7">
              Connect wallet auth, store provider keys in Supabase, and keep live Zap runs user-owned.
            </p>
          </div>
          <Link className="zap-glass-pill min-h-11 px-4 font-medium text-sm" href={ZAP_DOCS_URL} prefetch={false}>Docs</Link>
        </div>
        <div aria-hidden className="zap-hairline mb-8" />
        <SettingsClient secretTypes={zapSecretTypes} />
      </div>
    </PageShell>
  );
}
