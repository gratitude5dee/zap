import { notFound } from "next/navigation";
import { loadZapFromSkill } from "@/lib/zap-files";
import { ZapRunner } from "./zap-runner";

export default async function ZapPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const zap = await loadZapFromSkill(slug);
  if (!zap) notFound();
  return <ZapRunner zap={zap} />;
}
