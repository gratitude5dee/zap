// @ts-check
// Payer tools over `zap pay` (§5.10). Read-only: quoting and status never
// spend, and there is no secret-writing MCP tool (C6).
import * as z from "zod/v4";
import { cliTool } from "../tool-helpers.js";

/**
 * @typedef {import("zod/v4").infer<typeof import("@modelcontextprotocol/sdk/types.js").CallToolResultSchema>} CallToolResult
 */

/**
 * Narrows a tool-helper payload to the SDK's CallToolResult shape.
 * @param {string[]} args
 * @returns {Promise<CallToolResult>}
 */
async function payCliTool(args) {
  return /** @type {CallToolResult} */ (await cliTool(args));
}

export const toolNames = [
  "zap_pay_status",
  "zap_pay_quote",
  "zap_pay_link_status",
  "zap_pay_link_request",
  "zap_pay_link_retrieve",
  "zap_pay_link_cancel",
  "zap_pay_link_list",
  "zap_pay_link_pay",
];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_pay_status",
    {
      title: "Payer Status",
      description: "Show the resolved payer (byok, managed, or missing). Never returns secret values.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => payCliTool(["pay", "status", "--json"]),
  );

  server.registerTool(
    "zap_pay_quote",
    {
      title: "Payer Quote",
      description: "Quote the estimated cost of a provider call without spending.",
      inputSchema: {
        model: z.string().optional(),
        provider: z.string(),
        units: z.number().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ model, provider, units }) => {
      const args = ["pay", "quote", "--provider", provider, "--json"];
      if (model) args.push("--model", model);
      if (units !== undefined) args.push("--units", String(units));
      return payCliTool(args);
    },
  );

  server.registerTool(
    "zap_pay_link_status",
    {
      title: "Link Wallet Status",
      description:
        "Show the Stripe Link agent-wallet connection state. Connecting is interactive (`zap pay link connect` in a terminal); this tool is read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => payCliTool(["pay", "link", "status", "--json"]),
  );

  server.registerTool(
    "zap_pay_link_request",
    {
      title: "Link Spend Request",
      description:
        "Create an owner-approved Link spend request (agentic payment). No credential is issued until the owner approves in Link. Card credentials are written to outputFile (0600), never returned.",
      inputSchema: {
        amount: z.number().int().positive().describe("Amount in cents."),
        context: z.string().min(100).describe("Purchase description the owner reads when approving (min 100 chars)."),
        credentialType: z.enum(["card", "shared_payment_token"]).default("card"),
        currency: z.string().length(3).default("usd"),
        merchantName: z.string().optional().describe("Required for card requests."),
        merchantUrl: z.string().optional().describe("Required for card requests."),
        networkId: z.string().optional().describe("Required for shared_payment_token (MPP network id)."),
        outputFile: z.string().optional().describe("File path (0600) for card credentials — required for card requests; credentials never reach stdout."),
        test: z.boolean().default(false).describe("Use Link test mode (no real charge)."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ amount, context, credentialType, currency, merchantName, merchantUrl, networkId, outputFile, test }) => {
      const args = [
        "pay",
        "link",
        "request",
        "--amount",
        String(amount),
        "--currency",
        currency,
        "--context",
        context,
        "--credential-type",
        credentialType,
        "--json",
      ];
      if (merchantName) args.push("--merchant-name", merchantName);
      if (merchantUrl) args.push("--merchant-url", merchantUrl);
      if (networkId) args.push("--network-id", networkId);
      if (outputFile) args.push("--output-file", outputFile);
      if (test) args.push("--test");
      return payCliTool(args);
    },
  );

  server.registerTool(
    "zap_pay_link_retrieve",
    {
      title: "Link Spend Retrieve",
      description:
        "Retrieve/poll a Link spend request. Including card credentials requires outputFile (0600); stdout stays redacted.",
      inputSchema: {
        id: z.string().describe("Spend request id."),
        includeCard: z.boolean().default(false).describe("Write card credentials to outputFile."),
        outputFile: z.string().optional().describe("Required when includeCard is true."),
        timeout: z.number().positive().optional().describe("Polling timeout in seconds."),
      },
      annotations: { destructiveHint: true, readOnlyHint: false },
    },
    async ({ id, includeCard, outputFile, timeout }) => {
      const args = ["pay", "link", "retrieve", id, "--json"];
      if (outputFile) args.push("--output-file", outputFile);
      if (includeCard) args.push("--include", "card");
      if (timeout !== undefined) args.push("--timeout", String(timeout));
      return payCliTool(args);
    },
  );

  server.registerTool(
    "zap_pay_link_cancel",
    {
      title: "Link Spend Cancel",
      description: "Cancel a pending Link spend request.",
      inputSchema: { id: z.string().describe("Spend request id.") },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => payCliTool(["pay", "link", "cancel", id, "--json"]),
  );

  server.registerTool(
    "zap_pay_link_list",
    {
      title: "Link Spend List",
      description: "List Link spend requests (safe fields only).",
      inputSchema: {
        includeHistory: z.boolean().default(false).describe("Include expired and terminal spend requests."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ includeHistory }) => {
      const args = ["pay", "link", "list", "--json"];
      if (includeHistory) args.push("--include-history");
      return payCliTool(args);
    },
  );

  server.registerTool(
    "zap_pay_link_pay",
    {
      title: "Link MPP Pay",
      description:
        "Complete an HTTP 402 payment with an owner-approved shared payment token (`zap pay link pay`). The token is spent against the merchant URL inside link-cli and never returned.",
      inputSchema: {
        amount: z.number().int().positive().optional().describe("Amount in cents (derived from the 402 challenge if omitted)."),
        context: z.string().min(100).optional().describe("Required when spendRequestId is omitted; the owner reads it when approving."),
        data: z.string().optional().describe("Request body (implies POST)."),
        method: z.string().optional().describe("HTTP method."),
        spendRequestId: z.string().optional().describe("Approved spend request id with credential_type shared_payment_token."),
        test: z.boolean().default(false).describe("Use Link test mode (no real charge)."),
        url: z.string().describe("Merchant URL to pay."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ amount, context, data, method, spendRequestId, test, url }) => {
      const args = ["pay", "link", "pay", url, "--json"];
      if (spendRequestId) args.push("--spend-request-id", spendRequestId);
      if (context) args.push("--context", context);
      if (amount !== undefined) args.push("--amount", String(amount));
      if (method) args.push("--method", method);
      if (data) args.push("--data", data);
      if (test) args.push("--test");
      return payCliTool(args);
    },
  );
}
