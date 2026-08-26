"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCw, Square, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const API = "/api/cloud";

interface RuntimeRow {
  id: string;
  weight: string;
  provider: string;
  state: string;
  createdAt: string;
}

interface LedgerRow {
  unit: string;
  qty: number;
  usd: number;
  sku: string;
  at: string;
  receiptId?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

/**
 * Studio runtime panel: a thin client over the Zap control API — compose,
 * ps, prompt exec, payer status, and receipts. Payments come from the
 * connected browser wallet; plan-only stays the default.
 */
export function RuntimePanel() {
  const [runtimes, setRuntimes] = useState<RuntimeRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [payer, setPayer] = useState<string>("unknown");
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await api<RuntimeRow[]>("/v1/runtimes");
      setRuntimes(rows);
      setLedger(await api<LedgerRow[]>("/v1/meter/ledger"));
      setPayer("managed");
    } catch {
      setPayer("missing");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const compose = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/v1/runtimes", { method: "POST", body: JSON.stringify({ weight: "light", provider: "box" }) });
      await refresh();
    } catch (e) {
      setError(`Compose failed (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    setBusy(true);
    try {
      await api(`/v1/runtimes/${id}/down`, { method: "POST", body: "{}" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const exec = async () => {
    if (!selected || !prompt) return;
    setBusy(true);
    setError(null);
    setOutput("");
    try {
      const result = await api<{ runId: string; live: boolean }>(`/v1/runtimes/${selected}/exec`, {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      setOutput(`Run ${result.runId} started (plan-only: ${!result.live}).`);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "402"
          ? "Payment required — connect a wallet with x402 support to pay per run."
          : "Exec failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 text-sm text-white">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Runtime</h1>
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          <span>payer: {payer}</span>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {error ? <p className="rounded bg-red-950 p-2 text-red-300">{error}</p> : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Runtimes</h2>
          <Button size="sm" onClick={() => void compose()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compose"}
          </Button>
        </div>
        <ul className="flex flex-col gap-1">
          {runtimes.length === 0 ? <li className="text-white/60">No runtimes yet.</li> : null}
          {runtimes.map((row) => (
            <li
              key={row.id}
              className={`flex items-center justify-between rounded border border-white/10 p-2 ${
                selected === row.id ? "bg-white/10" : ""
              }`}
            >
              <button type="button" className="text-left" onClick={() => setSelected(row.id)}>
                <span className="font-mono">{row.id}</span> · {row.weight} · {row.state}
              </button>
              <Button size="sm" variant="ghost" onClick={() => void stop(row.id)} aria-label="Stop runtime">
                <Square className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Prompt</h2>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe what the runtime should plan (plan-only by default)…"
        />
        <div>
          <Button size="sm" onClick={() => void exec()} disabled={busy || !selected || !prompt}>
            <Play className="mr-1 h-4 w-4" /> Run
          </Button>
        </div>
        {output ? <pre className="rounded bg-black/40 p-2">{output}</pre> : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Receipts</h2>
        <ul className="flex flex-col gap-1">
          {ledger.length === 0 ? <li className="text-white/60">No meter activity yet.</li> : null}
          {ledger.map((row, index) => (
            <li key={`${row.at}-${index}`} className="flex justify-between rounded border border-white/10 p-2">
              <span>
                {row.sku} · {row.qty} {row.unit}
              </span>
              <span>${row.usd.toFixed(4)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
