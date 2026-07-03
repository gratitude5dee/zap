"use client";

import { KeyRound, Loader2, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MaskedZapSecret, ZapSecretType } from "@/lib/supabase/secrets";

type SecretsResponse = {
  configured: boolean;
  error?: string;
  secretTypes: ZapSecretType[];
  secrets: MaskedZapSecret[];
};

export function SettingsClient({ secretTypes }: { readonly secretTypes: readonly ZapSecretType[] }) {
  const [token, setToken] = useState("");
  const [secrets, setSecrets] = useState<MaskedZapSecret[]>([]);
  const [secretType, setSecretType] = useState<ZapSecretType>(secretTypes[0]);
  const [secretValue, setSecretValue] = useState("");
  const [walletPayload, setWalletPayload] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stored = useMemo(() => new Map(secrets.map((secret) => [secret.secretType, secret])), [secrets]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("zap.supabaseToken");
    if (saved) {
      setToken(saved);
      void refresh(saved);
    }
  }, []);

  async function refresh(nextToken = token) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/secrets", {
        headers: nextToken ? { authorization: `Bearer ${nextToken}` } : {},
      });
      const payload = (await response.json()) as SecretsResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not load secrets.");
      setSecrets(payload.secrets ?? []);
      setMessage(payload.configured ? "Secret vault connected." : "Supabase env is not configured.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load secrets.");
    } finally {
      setLoading(false);
    }
  }

  async function saveToken() {
    window.sessionStorage.setItem("zap.supabaseToken", token);
    await refresh(token);
  }

  async function exchangeWalletProof() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/wallet-proof", {
        body: walletPayload,
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Wallet proof failed.");
      const accessToken = payload.access_token ?? payload.session?.access_token ?? payload.token;
      if (!accessToken) throw new Error("Wallet proof response did not include an access token.");
      setToken(accessToken);
      window.sessionStorage.setItem("zap.supabaseToken", accessToken);
      await refresh(accessToken);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet proof failed.");
    } finally {
      setLoading(false);
    }
  }

  async function upsertSecret() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/secrets", {
        body: JSON.stringify({ secretType, value: secretValue }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "PUT",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save secret.");
      setSecretValue("");
      await refresh(token);
      setMessage(`${secretType} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save secret.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSecret(type: ZapSecretType) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/secrets", {
        body: JSON.stringify({ secretType: type }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not delete secret.");
      await refresh(token);
      setMessage(`${type} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete secret.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <section className="rounded-lg border bg-white p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-teal-50 text-teal-800">
            <WalletCards className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-xl">Thirdweb Wallet Auth</h2>
            <p className="text-sm text-zinc-600">Use a Supabase access token from the wallet proof flow.</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block font-medium text-sm">Supabase access token</span>
          <Textarea
            className="min-h-24"
            onChange={(event) => setToken(event.target.value.trim())}
            placeholder="Paste the access_token returned by the Thirdweb/Supabase wallet proof flow"
            value={token}
          />
        </label>
        <Button className="mt-3 gap-2" disabled={!token || loading} onClick={saveToken}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Connect Vault
        </Button>

        <div className="mt-7 border-zinc-200 border-t pt-5">
          <h3 className="font-semibold">Wallet proof proxy</h3>
          <p className="mt-1 text-sm text-zinc-600">Paste the JSON payload produced by your Thirdweb wallet signature flow.</p>
          <Textarea
            className="mt-3 min-h-32 font-mono text-xs"
            onChange={(event) => setWalletPayload(event.target.value)}
            placeholder='{"address":"0x...","message":"...","signature":"...","action":"zap-auth"}'
            value={walletPayload}
          />
          <Button className="mt-3" disabled={!walletPayload || loading} onClick={exchangeWalletProof} variant="outline">
            Exchange Proof
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-amber-50 text-amber-800">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-xl">Provider Secrets</h2>
            <p className="text-sm text-zinc-600">Stored encrypted in Supabase. Browser reads are masked.</p>
          </div>
        </div>

        <div className="grid gap-3">
          <Select onValueChange={(value) => setSecretType(value as ZapSecretType)} value={secretType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {secretTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            onChange={(event) => setSecretValue(event.target.value)}
            placeholder="Paste provider key or account id"
            type="password"
            value={secretValue}
          />
          <Button disabled={!token || !secretValue || loading} onClick={upsertSecret}>Save Secret</Button>
        </div>

        <div className="mt-6 space-y-2">
          {secretTypes.map((type) => {
            const secret = stored.get(type);
            return (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-zinc-50 px-3 py-2" key={type}>
                <div>
                  <p className="font-medium text-sm">{type}</p>
                  <p className="text-zinc-500 text-xs">{secret ? `stored ${secret.last4 ?? "****"}` : "not stored"}</p>
                </div>
                <Button disabled={!secret || loading} onClick={() => deleteSecret(type)} size="icon" variant="ghost">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
        {message ? <p className="mt-4 rounded-md border bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{message}</p> : null}
      </section>
    </div>
  );
}
