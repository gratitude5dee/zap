import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const drainProviderQueue = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    // Provider polling is implemented in the app/Eve runtime because it shares
    // provider adapters and Upstash credentials. Convex owns the schedule entry
    // and durable logs; the HTTP drain endpoint can be added without changing
    // the schema.
    return null;
  },
});
