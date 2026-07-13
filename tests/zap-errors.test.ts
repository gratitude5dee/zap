import { describe, expect, it } from "vitest";
import { toZapErrorMessage, toZapErrorPayload, ZapRunError } from "../lib/zap-errors";

describe("Zap error messages", () => {
  it("renders a structured API error with its actionable remediation", () => {
    const error = new ZapRunError({
      code: "INVALID_INPUT",
      message: "Missing required input FAN_COUNTRY.",
      remediation: "Provide FAN_COUNTRY before running caught-by-the-cam.",
      retryable: false,
    });

    expect(toZapErrorMessage(toZapErrorPayload(error))).toBe(
      "Missing required input FAN_COUNTRY. Provide FAN_COUNTRY before running caught-by-the-cam.",
    );
  });

  it("preserves plain API error strings", () => {
    expect(toZapErrorMessage("Wallet sign-in required.")).toBe("Wallet sign-in required.");
  });

  it("uses a safe fallback for unrecognized objects instead of coercing them", () => {
    expect(toZapErrorMessage({ detail: { secret: "do-not-render" } })).toBe("Zap run failed.");
  });

  it("accepts Error instances and custom fallbacks", () => {
    expect(toZapErrorMessage(new Error("Provider request timed out."))).toBe("Provider request timed out.");
    expect(toZapErrorMessage({}, "Run request was rejected.")).toBe("Run request was rejected.");
  });
});
