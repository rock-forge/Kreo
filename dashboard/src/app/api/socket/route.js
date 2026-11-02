import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { fetchDiscordGuilds, getGuildAccess } from "@/lib/discordAccess";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session?.user?.id || session.error) return reply({ error: "Unauthorized" }, 401);
  const guildId = new URL(req.url).searchParams.get("guildId");
  if (!/^\d{17,20}$/.test(guildId || "")) return reply({ error: "Invalid server" }, 400);
  if (!checkRateLimit(`${session.user.id}:socket`, { limit: 20, windowMs: 60_000 }).allowed) return reply({ error: "Too many requests" }, 429);
  try {
    const guilds = await fetchDiscordGuilds(session.accessToken);
    if (!getGuildAccess(guilds, guildId).isMember) return reply({ error: "Forbidden" }, 403);
    const secret = runtimeConfig.dashboard.bridgeSecret;
    if (!secret) return reply({ error: "Bridge is not configured" }, 503);
    const expiresAt = Date.now() + 5 * 60_000;
    const payload = Buffer.from(JSON.stringify({ guildId, userId: session.user.id, expiresAt })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return reply({ token: `${payload}.${signature}`, expiresAt });
  } catch {
    return reply({ error: "Could not verify server access" }, 502);
  }
}
