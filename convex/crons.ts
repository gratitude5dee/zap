import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("poll provider queue", { minutes: 2 }, internal.poller.drainProviderQueue, {});

export default crons;
