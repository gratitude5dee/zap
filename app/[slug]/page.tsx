import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { loadZapFromSkill } from "@/lib/zap-files";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { ZapRunner } from "@/app/zap/[slug]/zap-runner";
import { resolveWalletPrincipal } from "@/lib/supabase/server";

export default async function RootZapPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();
  const token = (await cookies()).get("zap_supabase_token")?.value;
  const principal = token ? await resolveWalletPrincipal(token) : null;
  const zap = await loadZapFromSkill(slug, principal?.principalId);
  if (!zap) notFound();
  return <ZapRunner zap={zap} />;
}
