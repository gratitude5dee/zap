import { describe, expect, it } from "vitest";
import {
  parseManagedProviderKeys,
  selectProviderCredentialSet,
} from "../lib/provider-credentials";

describe("provider credential resolution", () => {
  const request = { gmi_api_key: "request-key", gmi_org_id: "request-org" };
  const vault = { gmi_api_key: "vault-key", gmi_org_id: "vault-org" };
  const managed = { gmi_api_key: "cloud-key", gmi_org_id: "cloud-org" };

  it("uses request BYOK before the user vault and managed cloud", () => {
    expect(selectProviderCredentialSet("gmi", { managed, request, vault })).toEqual({
      secrets: request,
      source: "request-byok",
    });
  });

  it("never merges a partial source with another source", () => {
    expect(selectProviderCredentialSet("gmi", {
      managed,
      request: { gmi_api_key: "partial-request" },
      vault,
    })).toEqual({ secrets: vault, source: "user-vault" });
    expect(selectProviderCredentialSet("gmi", {
      managed: { gmi_org_id: "partial-cloud" },
      request: { gmi_api_key: "partial-request" },
      vault: { gmi_org_id: "partial-vault" },
    })).toBeNull();
  });

  it("parses both provider-scoped and flat managed-key bundles", () => {
    expect(parseManagedProviderKeys(JSON.stringify({ gmi: managed }))).toMatchObject(managed);
    expect(parseManagedProviderKeys(JSON.stringify(managed))).toMatchObject(managed);
    expect(() => parseManagedProviderKeys("not json")).toThrow(/JSON/);
  });
});
