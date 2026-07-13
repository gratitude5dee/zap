// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("thirdweb", () => ({
  createThirdwebClient: () => ({ clientId: "test-client" }),
}));

vi.mock("thirdweb/react", () => ({
  ConnectButton: () => createElement("button", { "data-thirdweb-connect": true }, "Interactive wallet"),
}));

import { WalletSignInButton } from "../app/_components/wallet-sign-in-button";

describe("WalletSignInButton", () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("server-renders a stable placeholder before thirdweb mounts", () => {
    const html = renderToStaticMarkup(createElement(WalletSignInButton, {
      clientId: "test-client",
      label: "Sign In",
    }));

    expect(html).toContain("Sign In");
    expect(html).toContain("disabled");
    expect(html).toContain("h-[50px]");
    expect(html).toContain("w-[165px]");
    expect(html).not.toContain("data-thirdweb-connect");
  });

  it("hydrates the placeholder before mounting thirdweb without a mismatch", async () => {
    const props = { clientId: "test-client", label: "Sign In" };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(WalletSignInButton, props));
    document.body.append(container);
    const consoleErrors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      consoleErrors.push(args.map(String).join(" "));
    });
    let root: Root | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, createElement(WalletSignInButton, props));
      });

      expect(container.querySelector("[data-thirdweb-connect]")?.textContent).toBe("Interactive wallet");
      expect(consoleErrors.join("\n")).not.toMatch(/hydration|did not match/i);
    } finally {
      if (root) await act(async () => root?.unmount());
      errorSpy.mockRestore();
    }
  });
});
