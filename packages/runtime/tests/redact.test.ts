// C24 canaries — every secret class must be redacted from log lines.
import { describe, expect, it } from "vitest";
import { createRedactingLog, redact, redactDeep, REDACTED } from "../src/redact.ts";

const canaries: Array<{ name: string; line: string; secret: string }> = [
  {
    name: "hosted url _token",
    line: "hosted https://p8080.box.example/path?_token=tok_abc123def",
    secret: "tok_abc123def",
  },
  {
    name: "desktop url",
    line: "opened https://box.example/desktop/stream/abcdef123456",
    secret: "desktop/stream/abcdef123456",
  },
  { name: "box api key", line: "using box_live_k3yS3cr3tValue00", secret: "box_live_k3yS3cr3tValue00" },
  { name: "runtime token", line: "RUNTIME_TOKEN=rt_secret_value_1", secret: "rt_secret_value_1" },
  { name: "selfhost token", line: 'ZAP_SELFHOST_TOKEN: "vps_secret_99"', secret: "vps_secret_99" },
  { name: "gateway token", line: "GATEWAY_TOKEN=gw_secret_77", secret: "gw_secret_77" },
  { name: "bearer header", line: "authorization: Bearer abc.def-ghi_jkl", secret: "abc.def-ghi_jkl" },
  { name: "ingress auth", line: "x-nsc-ingress-auth: ingress0token0value", secret: "ingress0token0value" },
  { name: "bridge token", line: "X-Zap-Bridge-Token: bridge0secret0value", secret: "bridge0secret0value" },
  { name: "openai-style key", line: "key sk-abcdefghijklmnop1234", secret: "sk-abcdefghijklmnop1234" },
  { name: "thirdweb secret", line: "tw tw_secret_abcDEF123", secret: "tw_secret_abcDEF123" },
  { name: "cdp secret", line: "CDP_API_KEY_SECRET=cdpsecretvalue123", secret: "cdpsecretvalue123" },
  { name: "mpp secret", line: "MPP_SECRET=mppsecretvalue456", secret: "mppsecretvalue456" },
  { name: "fal key", line: "FAL_KEY=falsecret789", secret: "falsecret789" },
];

describe("redact", () => {
  it.each(canaries)("redacts $name", ({ line, secret }) => {
    const safe = redact(line);
    expect(safe).not.toContain(secret);
    expect(safe).toContain(REDACTED);
  });

  it("leaves ordinary log lines alone", () => {
    const line = "box POST /boxes/box-123/commands ok";
    expect(redact(line)).toBe(line);
  });

  it("redactDeep walks structured payloads", () => {
    const payload = redactDeep({
      nested: { url: "https://x?_token=deepsecret1" },
      list: ["RUNTIME_TOKEN=deepsecret2"],
      count: 3,
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("deepsecret1");
    expect(text).not.toContain("deepsecret2");
    expect(payload.count).toBe(3);
  });

  it("createRedactingLog buffers only redacted lines", () => {
    const sink: string[] = [];
    const { log, buffer } = createRedactingLog((line) => sink.push(line));
    log("hosted https://p.example?_token=buffered_secret");
    expect(buffer.join("\n")).not.toContain("buffered_secret");
    expect(sink.join("\n")).not.toContain("buffered_secret");
  });
});
