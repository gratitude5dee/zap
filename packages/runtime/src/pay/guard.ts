import type { Context, RunEvent, RunInput, RunResult } from "@wzrdtech/zap-kernel";
import { PayError } from "./errors.ts";
import type { MeterLine, MeterService, PayerMode, QuoteLine } from "../meter/units.ts";

export interface Payer {
  mode: PayerMode;
  address?: string;
}

export interface PayService {
  status(): PayerMode;
  payer(): Payer | null;
}

export interface HarnessDriverLike {
  run(input: RunInput): Promise<RunResult>;
}

function usageLines(events: readonly RunEvent[]): MeterLine[] {
  const lines: MeterLine[] = [];
  for (const event of events) {
    if (event.type !== "run.completed") continue;
    const usage = event.usage as { lines?: QuoteLine[] } | undefined;
    for (const line of usage?.lines ?? []) {
      lines.push({ ...line, usd: 0 });
    }
  }
  return lines;
}

/**
 * Caller-side payer gate: every prompt run needs a payer (model tokens are
 * spend even in plan-only), `--live` needs one too, and usage from
 * `run.completed` settles against the meter. Applied by the pay plugins via
 * `ctx.intercept("harness", ...)` so no run starts before the payer check.
 */
export function guardHarness(ctx: Context, pay: PayService): void {
  ctx.intercept<HarnessDriverLike>("harness", (driver) => ({
    ...driver,
    async run(input: RunInput): Promise<RunResult> {
      const payer = pay.payer();
      if (input.live && !payer) {
        throw new PayError(
          "PAYER_MISSING",
          "Live runs require a payer.",
          "Run zap pay login --managed, or set ZAP_PAYER_MODE=byok with provider keys.",
        );
      }
      if (input.prompt !== undefined && !payer) {
        throw new PayError(
          "PAYER_MISSING",
          "A prompt run requires a payer even in plan-only mode: model tokens are spend.",
          "Run zap pay login --managed, or set ZAP_PAYER_MODE=byok with provider keys.",
        );
      }
      const result = await driver.run({ ...input, live: input.live ?? false });
      const meter = ctx.get<MeterService>("meter");
      if (meter && payer) {
        const raw = usageLines(result.events);
        if (raw.length > 0) {
          const quote = await meter.quote({ lines: raw, live: input.live ?? false });
          await meter.settle(
            { principalId: payer.address ? `wallet:${payer.address}` : `payer:${payer.mode}`, runId: result.id },
            quote.lines,
          );
        }
      }
      return result;
    },
  }));
}
