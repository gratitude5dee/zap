import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabasePublicConfig, revealManagedProviderSecrets } from "../lib/supabase/server";
import { maskSecret, providerFromSecretType, requiredSecretTypesForProvider } from "../lib/supabase/secrets";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.ZAP_MANAGED_PROVIDER_SECRETS_FUNCTION;
  delete process.env.ZAP_SECRET_REVEAL_TOKEN;
  vi.restoreAllMocks();
});

describe("Supabase BYOK secret contract", () => {
  it("maps providers to required secret types", () => {
    expect(requiredSecretTypesForProvider("gmi")).toEqual(["gmi_api_key"]);
    expect(requiredSecretTypesForProvider("fal")).toEqual(["fal_key"]);
    expect(requiredSecretTypesForProvider("prodia")).toEqual(["prodia_token"]);
    expect(requiredSecretTypesForProvider("runware")).toEqual(["runware_key"]);
    expect(requiredSecretTypesForProvider("vertex")).toEqual(["vertex_project", "vertex_location", "vertex_api_key", "vertex_service_account", "vertex_output_gcs_uri"]);
    expect(requiredSecretTypesForProvider("aws")).toEqual(["aws_access_key_id", "aws_secret_access_key", "aws_session_token", "aws_region", "aws_s3_output_uri", "aws_role_arn"]);
    expect(requiredSecretTypesForProvider("openrouter")).toEqual(["openrouter_key"]);
  });

  it("masks and classifies secret metadata", () => {
    expect(maskSecret("sk-123456")).toBe("****3456");
    expect(providerFromSecretType("gmi_api_key")).toBe("gmi");
    expect(providerFromSecretType("vertex_project")).toBe("vertex");
    expect(providerFromSecretType("aws_s3_output_uri")).toBe("aws");
    expect(providerFromSecretType("ai_gateway_api_key")).toBe("ai_gateway");
  });

  it("uses indexed RLS policies optimized for auth.uid", () => {
    const sql = readFileSync("supabase/migrations/20260703000000_zap_user_secrets.sql", "utf8");
    const hardeningSql = readFileSync("supabase/migrations/20260711000000_zap_supabase_advisor_hardening.sql", "utf8");
    const grantsSql = readFileSync("supabase/migrations/20260711010000_zap_sensitive_table_grants.sql", "utf8");
    expect(sql).toContain("create table if not exists public.user_secrets");
    expect(sql).toContain("alter column encrypted_value drop not null");
    expect(sql).toContain("user_secrets_user_id_idx");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).toContain("force row level security");
    expect(hardeningSql).toContain("set search_path = ''");
    expect(hardeningSql).toContain("drop index public.user_secrets_user_id_secret_type_idx");
    expect(grantsSql).toContain('drop policy if exists "Users can view their own secrets"');
    expect(grantsSql).toContain("revoke all on table public.user_secrets from anon, authenticated");
    expect(grantsSql).toContain("revoke all on table public.wallet_auth_nonces from anon, authenticated");
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

  it("normalizes accidental escaped newline suffixes from deployment tooling", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co\\n";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable\\n";

    expect(getSupabasePublicConfig()).toEqual({
      apiKey: "sb_publishable",
      url: "https://project.supabase.co",
    });
  });

  it("retrieves managed provider credentials only through the server-authenticated edge function", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable";
    process.env.ZAP_SECRET_REVEAL_TOKEN = "server-reveal-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      secrets: { fal_key: "managed-fal-key" },
    }), { status: 200 }));

    await expect(revealManagedProviderSecrets("fal")).resolves.toEqual({ fal_key: "managed-fal-key" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/zap-managed-provider-secrets",
      expect.objectContaining({
        body: JSON.stringify({ provider: "fal" }),
        headers: expect.objectContaining({ "x-zap-server-secret": "server-reveal-token" }),
        method: "POST",
      }),
    );
  });

  it("keeps managed Supabase credentials behind an allow-list and custom server authentication", () => {
    const source = readFileSync("supabase/functions/zap-managed-provider-secrets/index.ts", "utf8");
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(source).toContain('request.headers.get("x-zap-server-secret")');
    expect(source).toContain('fal_key: ["FAL_KEY"]');
    expect(source).toContain('box_api_key: ["BOX_API_KEY"]');
    expect(source).toContain('daytona_api_key: ["DAYTONA_API_KEY"]');
    expect(source).toContain("constantTimeEqual");
    expect(source).not.toContain("access-control-allow-origin");
    expect(config).toContain("[functions.zap-managed-provider-secrets]\nverify_jwt = false");
  });
});
