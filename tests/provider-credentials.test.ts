import { describe, expect, it } from "vitest";
import {
  parseManagedProviderKeys,
  selectProviderCredentialSet,
} from "../lib/provider-credentials";

describe("provider credential resolution", () => {
  const request = { gmi_api_key: "request-key" };
  const vault = { gmi_api_key: "vault-key" };
  const managed = { gmi_api_key: "cloud-key" };

  it("uses request BYOK before the user vault and managed cloud", () => {
    expect(selectProviderCredentialSet("gmi", { managed, request, vault })).toEqual({
      secrets: request,
      source: "request-byok",
    });
  });

  it("accepts a GMI API key without an organization id and never merges sources", () => {
    expect(selectProviderCredentialSet("gmi", {
      managed,
      request: { fal_key: "wrong-provider-key" },
      vault,
    })).toEqual({ secrets: vault, source: "user-vault" });
    expect(selectProviderCredentialSet("gmi", {
      managed: { fal_key: "wrong-provider-key" },
      request: { prodia_token: "wrong-provider-token" },
      vault: { runware_key: "wrong-provider-key" },
    })).toBeNull();
  });

  it("parses both provider-scoped and flat managed-key bundles", () => {
    expect(parseManagedProviderKeys(JSON.stringify({ gmi: managed }))).toMatchObject(managed);
    expect(parseManagedProviderKeys(JSON.stringify(managed))).toMatchObject(managed);
    expect(() => parseManagedProviderKeys("not json")).toThrow(/JSON/);
  });
});
