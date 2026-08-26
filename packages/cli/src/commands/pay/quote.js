const DEFAULT_API_URL = "https://zap.wzrd.tech/api/cloud";

/** `zap pay quote [--json]` — asks the control API what a gated call costs. */
export async function payQuote(args, io) {
  const apiUrl = io.env?.ZAP_API_URL ?? DEFAULT_API_URL;
  const fetchImpl = io.fetch ?? fetch;
  const res = await fetchImpl(`${apiUrl}/v1/pay/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${io.apiToken ?? ""}` },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    io.error(`Quote failed (${res.status}).`);
    return 1;
  }
  const body = await res.json();
  if (args.includes("--json")) io.out(JSON.stringify(body, null, 2));
  else io.out(`Gated call price: $${body.usd}`);
  return 0;
}
