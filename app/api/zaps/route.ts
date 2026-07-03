import { NextResponse } from "next/server";
import { listZapSpecs } from "@/lib/zap-files";

export async function GET() {
  return NextResponse.json({ zaps: await listZapSpecs() });
}
