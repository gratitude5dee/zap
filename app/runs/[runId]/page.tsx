import { RunProgress } from "./run-progress";

export default async function RunPage({ params }: { readonly params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <main className="min-h-dvh bg-[#f7f7f2] px-5 py-6 text-zinc-950">
      <div className="mx-auto max-w-5xl rounded-lg border bg-white p-5">
        <h1 className="font-semibold text-2xl">Run {runId}</h1>
        <RunProgress runId={runId} />
      </div>
    </main>
  );
}
