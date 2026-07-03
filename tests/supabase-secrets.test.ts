import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maskSecret, providerFromSecretType, requiredSecretTypesForProvider } from "../lib/supabase/secrets";

describe("Supabase BYOK secret contract", () => {
  it("maps providers to required secret types", () => {
    expect(requiredSecretTypesForProvider("gmi")).toEqual(["gmi_api_key", "gmi_org_id"]);
    expect(requiredSecretTypesForProvider("fal")).toEqual(["fal_key"]);
    expect(requiredSecretTypesForProvider("openrouter")).toEqual(["openrouter_key"]);
  });

  it("masks and classifies secret metadata", () => {
    expect(maskSecret("sk-123456")).toBe("****3456");
    expect(providerFromSecretType("gmi_api_key")).toBe("gmi");
    expect(providerFromSecretType("ai_gateway_api_key")).toBe("ai_gateway");
  });

  it("uses indexed RLS policies optimized for auth.uid", () => {
    const sql = readFileSync("supabase/migrations/20260703000000_zap_user_secrets.sql", "utf8");
    expect(sql).toContain("user_secrets_user_id_idx");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).toContain("force row level security");
  });
});
