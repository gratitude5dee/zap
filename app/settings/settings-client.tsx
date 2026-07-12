"use client";

import { KeyRound, Link2, Loader2, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MaskedZapSecret, ZapSecretType } from "@/lib/supabase/secrets";
import { createWalletLoginMessage, type WalletLoginPayload } from "@/lib/wallet-siwe";

type SecretsResponse = {
  configured: boolean;
  error?: string;
  secretTypes: ZapSecretType[];
  secrets: MaskedZapSecret[];
};

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function SettingsClient({ secretTypes }: { readonly secretTypes: readonly ZapSecretType[] }) {
  const [token, setToken] = useState("");
  const [secrets, setSecrets] = useState<MaskedZapSecret[]>([]);
  const [secretType, setSecretType] = useState<ZapSecretType>(secretTypes[0]);
  const [secretValue, setSecretValue] = useState("");
  const [walletPayload, setWalletPayload] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [channelLink, setChannelLink] = useState<{ code: string; expiresAt: number } | null>(null);
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

  async function connectWalletAndSign() {
    setLoading(true);
    setMessage(null);
    try {
      const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
      if (!ethereum) throw new Error("No injected wallet found. Connect with your Thirdweb wallet and paste its proof payload, or install a browser wallet.");
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No wallet account selected.");
      const chainHex = await ethereum.request({ method: "eth_chainId" }) as string;
      const payloadResponse = await fetch("/api/auth/wallet-proof/payload", {
        body: JSON.stringify({ address, chainId: Number.parseInt(chainHex, 16) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const loginPayload = await payloadResponse.json() as WalletLoginPayload & { error?: string };
      if (!payloadResponse.ok) throw new Error(loginPayload.error ?? "Could not prepare wallet sign-in.");
      const message = createWalletLoginMessage(loginPayload);
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, address],
      }) as string;
      const payload = JSON.stringify({
        payload: loginPayload,
        signature,
      }, null, 2);
      setWalletPayload(payload);
      await exchangeWalletProof(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet signing failed.");
    } finally {
      setLoading(false);
    }
  }

  async function exchangeWalletProof(proofPayload = walletPayload) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/wallet-proof", {
        body: proofPayload,
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const responsePayload = await response.json();
      if (!response.ok) throw new Error(responsePayload.error ?? "Wallet proof failed.");
      const accessToken = responsePayload.access_token ?? responsePayload.session?.access_token ?? responsePayload.token;
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

  async function issueChannelLinkCode() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/channels/link-code", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        method: "POST",
      });
      const payload = await response.json() as { code?: string; error?: string; expiresAt?: number };
      if (!response.ok || !payload.code || !payload.expiresAt) {
        throw new Error(payload.error ?? "Could not issue a channel link code.");
      }
      setChannelLink({ code: payload.code, expiresAt: payload.expiresAt });
      setMessage("One-use channel link code created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not issue a channel link code.");
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
      <section className="rounded-md border border-white/10 bg-black/25 p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-zap-ink text-zap-cyan">
            <WalletCards className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-xl text-white">Thirdweb Wallet Auth</h2>
            <p className="text-sm text-white/50">Use a Supabase access token from the wallet proof flow.</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block font-medium text-sm text-white/82">Supabase access token</span>
          <Textarea
            className="min-h-24 border-white/15 bg-white/[0.04] text-white placeholder:text-white/35"
            onChange={(event) => setToken(event.target.value.trim())}
            placeholder="Paste the access_token returned by the Thirdweb/Supabase wallet proof flow"
            value={token}
          />
        </label>
        <Button className="mt-3 gap-2" disabled={!token || loading} onClick={saveToken}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Connect Vault
        </Button>

        <div className="mt-7 border-white/10 border-t pt-5">
          <h3 className="font-semibold text-white">Wallet proof proxy</h3>
          <p className="mt-1 text-sm text-white/50">Sign a Zap wallet proof, or paste the JSON payload produced by your Thirdweb wallet signature flow.</p>
          <Button className="mt-3 gap-2" disabled={loading} onClick={connectWalletAndSign} variant="outline">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <WalletCards className="size-4" />}
            Connect Wallet and Sign
          </Button>
          <Textarea
            className="mt-3 min-h-32 border-white/15 bg-white/[0.04] font-mono text-white text-xs placeholder:text-white/35"
            onChange={(event) => setWalletPayload(event.target.value)}
            placeholder='{"payload":{"address":"0x...","domain":"zap.wzrd.tech","nonce":"..."},"signature":"0x..."}'
            value={walletPayload}
          />
          <Button className="mt-3" disabled={!walletPayload || loading} onClick={() => exchangeWalletProof()} variant="outline">
            Exchange Proof
          </Button>
        </div>

        <div className="mt-7 border-white/10 border-t pt-5">
          <h3 className="flex items-center gap-2 font-semibold text-white"><Link2 className="size-4" /> Link a chat channel</h3>
          <p className="mt-1 text-sm text-white/50">
            Generate a one-use code, then send <code>/link CODE</code> to Zap in Slack, Telegram, or iMessage. Codes expire after five minutes.
          </p>
          <Button className="mt-3 gap-2" disabled={loading} onClick={issueChannelLinkCode} variant="outline">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Generate link code
          </Button>
          {channelLink ? (
            <div className="mt-3 rounded-md border border-zap-cyan/30 bg-zap-cyan/10 p-3">
              <p className="font-mono font-semibold text-lg text-zap-cyan tracking-wider">{channelLink.code}</p>
              <p className="mt-1 text-white/50 text-xs">Expires {new Date(channelLink.expiresAt).toLocaleTimeString()}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-black/25 p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-zap-amber text-zap-ink">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-xl text-white">Provider Secrets</h2>
            <p className="text-sm text-white/50">Stored encrypted in Supabase. Browser reads are masked.</p>
          </div>
        </div>

        <div className="grid gap-3">
          <Select onValueChange={(value) => setSecretType(value as ZapSecretType)} value={secretType}>
            <SelectTrigger className="w-full border-white/15 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0c1218] text-white">
              {secretTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="border-white/15 bg-white/[0.04] text-white placeholder:text-white/35"
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
              <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2" key={type}>
                <div>
                  <p className="font-medium text-sm text-white">{type}</p>
                  <p className="text-white/45 text-xs">{secret ? `stored ${secret.last4 ?? "****"}` : "not stored"}</p>
                </div>
                <Button disabled={!secret || loading} onClick={() => deleteSecret(type)} size="icon" variant="ghost">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
        {message ? <p className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/58">{message}</p> : null}
      </section>
    </div>
  );
}
