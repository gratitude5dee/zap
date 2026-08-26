import { defineProject } from "@wzrdtech/zap-agent";
export default defineProject({ agents: { transcode: () => import("./agents/transcode/agent"), researcher: () => import("./agents/researcher/agent") } });
