import { RunProgress } from "./run-progress";
import { PageShell, SiteNav } from "@/app/_components/zap-chrome";

export default async function RunPage({ params }: { readonly params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <PageShell className="zap-metal-field" tone="dark">
      <div className="mx-auto max-w-5xl px-5 py-5 lg:px-8">
        <SiteNav tone="dark" />
        <section className="zap-gradient-card mt-10 rounded-md p-5">
          <p className="font-mono text-xs text-zap-cyan">run status</p>
          <h1 className="mt-2 break-all font-semibold text-3xl leading-tight text-white">Run {runId}</h1>
          <RunProgress runId={runId} />
        </section>
      </div>
    </PageShell>
  );
}
