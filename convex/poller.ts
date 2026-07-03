import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const drainProviderQueue = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    const url = process.env.ZAP_POLL_DRAIN_URL;
    if (!url) return null;
    await fetch(url, {
      headers: process.env.ZAP_POLL_DRAIN_SECRET ? { "x-zap-cron-secret": process.env.ZAP_POLL_DRAIN_SECRET } : {},
      method: "POST",
    });
    return null;
  },
});
