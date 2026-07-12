import { NextResponse } from "next/server";
import { searchZapRegistry } from "@/lib/zap-registry";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  return NextResponse.json({ query, zaps: searchZapRegistry(query) });
}
