import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const drainProviderQueue = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    const url = process.env.ZAP_POLL_DRAIN_URL;
    if (!url) throw new Error("ZAP_POLL_DRAIN_URL is required.");
    const secret = process.env.ZAP_POLL_DRAIN_SECRET;
    if (!secret) throw new Error("ZAP_POLL_DRAIN_SECRET is required.");
    const response = await fetch(url, {
      headers: { "x-zap-cron-secret": secret },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Provider poll drain failed with ${response.status}.`);
    }
    return null;
  },
});
