import Link from "next/link";
import { Film, Sparkles } from "lucide-react";
import { listZapSpecs } from "@/lib/zap-files";

export default async function GalleryPage() {
  const zaps = await listZapSpecs();
  return (
    <main className="min-h-dvh bg-[#f6f6f0] px-5 py-8 text-zinc-950 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm text-teal-800"><Sparkles className="size-4" /> Registry</p>
            <h1 className="font-semibold text-4xl tracking-normal">Zap Gallery</h1>
          </div>
          <Link className="rounded-md border bg-white px-3 py-2 text-sm" href="/">Home</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {zaps.map((zap) => (
            <Link className="rounded-lg border border-zinc-200 bg-white p-5 hover:border-zinc-400" href={`/zap/${zap.zap}`} key={zap.zap}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-2xl">{zap.title}</h2>
                  <p className="mt-2 text-sm text-zinc-600 leading-6">{zap.description}</p>
                </div>
                <Film className="size-5 text-teal-700" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                <span className="rounded bg-zinc-100 px-2 py-2">{zap.steps.length} steps</span>
                <span className="rounded bg-zinc-100 px-2 py-2">${zap.budget.cap_usd} cap</span>
                <span className="rounded bg-zinc-100 px-2 py-2">{zap.output}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
