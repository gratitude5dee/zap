import { createAgentManifestResponse } from "@/lib/agent-manifest";

export function GET() {
  return createAgentManifestResponse();
}
