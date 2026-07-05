import { notFound } from "next/navigation";
import { loadZapFromSkill } from "@/lib/zap-files";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { ZapRunner } from "@/app/zap/[slug]/zap-runner";

export default async function RootZapPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();
  const zap = await loadZapFromSkill(slug);
  if (!zap) notFound();
  return <ZapRunner zap={zap} />;
}
