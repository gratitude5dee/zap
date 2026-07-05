import { redirect } from "next/navigation";

export default async function ZapPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/${slug}`);
}
