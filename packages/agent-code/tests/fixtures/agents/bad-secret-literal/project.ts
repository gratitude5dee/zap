import { defineProject } from "@wzrdtech/zap-agent";
export default defineProject({ agents: { a: () => import("./agents/a/agent") } });
