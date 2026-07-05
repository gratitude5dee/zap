import { notFound } from "next/navigation";
import { loadZapFromSkill } from "@/lib/zap-files";
import { EmbedClient } from "./embed-client";

export default async function EmbedZapPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const zap = await loadZapFromSkill(slug);
  if (!zap) notFound();
  return <EmbedClient zap={zap} />;
}
