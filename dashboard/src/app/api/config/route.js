import { NextResponse } from "next/server";
import { runtimeConfig } from "@/lib/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    botApiUrl: runtimeConfig.dashboard.socketUrl,
  }, { headers: { "Cache-Control": "no-store" } });
}
