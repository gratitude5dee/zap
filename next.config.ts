import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't mis-infer it (e.g. as ./app).
  turbopack: { root: import.meta.dirname },
  async rewrites() {
    return {
      beforeFiles: [
        { destination: "/api/agent-manifest", source: "/.agent" },
        { destination: "/api/agent-manifest", source: "/.well-known/agent.json" },
        { destination: "/api/providers/:provider/webhook", source: "/providers/:provider/webhook" },
      ],
    };
  },
};

export default withEve(nextConfig);
