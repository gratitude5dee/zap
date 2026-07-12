import { createPublicZapPlanResponse } from "@/lib/public-zap-plan";

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ slug: string }> },
) {
  return createPublicZapPlanResponse(request, (await params).slug);
}
