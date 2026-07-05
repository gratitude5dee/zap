import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { getSupabasePublicConfig } from "../lib/supabase/server";
import { maskSecret, providerFromSecretType, requiredSecretTypesForProvider } from "../lib/supabase/secrets";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe("Supabase BYOK secret contract", () => {
  it("maps providers to required secret types", () => {
    expect(requiredSecretTypesForProvider("gmi")).toEqual(["gmi_api_key", "gmi_org_id"]);
    expect(requiredSecretTypesForProvider("fal")).toEqual(["fal_key"]);
    expect(requiredSecretTypesForProvider("prodia")).toEqual(["prodia_token"]);
    expect(requiredSecretTypesForProvider("runware")).toEqual(["runware_key"]);
    expect(requiredSecretTypesForProvider("openrouter")).toEqual(["openrouter_key"]);
  });

  it("masks and classifies secret metadata", () => {
    expect(maskSecret("sk-123456")).toBe("****3456");
    expect(providerFromSecretType("gmi_api_key")).toBe("gmi");
    expect(providerFromSecretType("ai_gateway_api_key")).toBe("ai_gateway");
  });

  it("uses indexed RLS policies optimized for auth.uid", () => {
    const sql = readFileSync("supabase/migrations/20260703000000_zap_user_secrets.sql", "utf8");
    expect(sql).toContain("create table if not exists public.user_secrets");
    expect(sql).toContain("user_secrets_user_id_idx");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).toContain("force row level security");
  });

  it("supports current publishable keys and legacy anon keys", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy_anon";

    expect(getSupabasePublicConfig()).toEqual({
      apiKey: "sb_publishable",
      url: "https://project.supabase.co",
    });

    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(getSupabasePublicConfig().apiKey).toBe("legacy_anon");
  });
});
