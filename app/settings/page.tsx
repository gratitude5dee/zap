import Link from "next/link";
import { SettingsClient } from "./settings-client";
import { zapSecretTypes } from "@/lib/supabase/secrets";

export default function SettingsPage() {
  return (
    <main className="min-h-dvh bg-[#f6f6f0] px-5 py-8 text-zinc-950 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link className="text-sm text-zinc-600" href="/">Zap</Link>
            <h1 className="mt-3 font-semibold text-4xl tracking-normal">Creator Settings</h1>
            <p className="mt-2 max-w-2xl text-zinc-600 leading-7">
              Connect wallet auth, store provider keys in Supabase, and keep live Zap runs user-owned.
            </p>
          </div>
          <Link className="rounded-md border bg-white px-3 py-2 text-sm" href="/docs">Docs</Link>
        </div>
        <SettingsClient secretTypes={zapSecretTypes} />
      </div>
    </main>
  );
}
