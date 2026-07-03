import { NextResponse } from "next/server";
import { zapSecretTypes } from "@/lib/supabase/secrets";

export async function GET() {
  return NextResponse.json({
    project: "wzrdstudio",
    secretTypes: zapSecretTypes,
    storage: "supabase.user_secrets",
  });
}
