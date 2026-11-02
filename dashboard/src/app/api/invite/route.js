import { NextResponse } from "next/server";
import { runtimeConfig } from "@/lib/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const clientId = runtimeConfig.dashboard.clientId;
  const guildId = new URL(request.url).searchParams.get("guildId");
  if (!/^\d{17,20}$/.test(clientId)) {
    return NextResponse.json({ error: "The bot invite is not configured." }, { status: 503 });
  }
  if (guildId && !/^\d{17,20}$/.test(guildId)) {
    return NextResponse.json({ error: "Invalid server." }, { status: 400 });
  }
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", "8");
  if (guildId) url.searchParams.set("guild_id", guildId);
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store" } });
}
