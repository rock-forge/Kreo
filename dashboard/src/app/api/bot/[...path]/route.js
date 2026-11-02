import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { fetchDiscordGuilds, getGuildAccess } from "@/lib/discordAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { runtimeConfig } from "@/lib/runtimeConfig";

import { resolveBotRoute, validateBotBody } from "@/lib/botRoutePolicy";

export const dynamic = "force-dynamic";

function withNoStoreHeaders(init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return {
    ...init,
    headers,
  };
}

function getBridgeHeaders(extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
  };

  if (runtimeConfig.dashboard.bridgeSecret) {
    headers["x-kreo-bridge-secret"] = runtimeConfig.dashboard.bridgeSecret;
  }

  return headers;
}

async function proxyToBot(req, params, method) {
  const body = method === "POST" ? await req.json().catch(() => null) : null;
  const policy = resolveBotRoute(params?.path, method, body);
  if (!policy) return NextResponse.json({ error: "Invalid bot API route" }, { status: 400 });
  const path = policy.path;
  if (method === "POST") {
    const error = validateBotBody(path, body);
    if (error) return NextResponse.json({ error }, { status: 400 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session?.user?.id || session.error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const guildId = policy.guildId;
  if (policy.scope !== "session") {
    let guilds;
    try { guilds = await fetchDiscordGuilds(session.accessToken); }
    catch { return NextResponse.json({ error: "Failed to verify guild access" }, { status: 502 }); }
    if (policy.scope === "guild-list") {
      const allowed = new Set(guilds.map((guild) => guild.id));
      body.guildIds = body.guildIds.filter((id) => allowed.has(id));
    } else {
      const access = getGuildAccess(guilds, guildId);
      if (!access.isMember || (policy.scope === "manager" && !access.canManage)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }
  if (["play", "play-batch", "player"].includes(path)) {
    body.userId = session.user.id;
    body.source = path === "play-batch" ? "dashboard_playlist" : "dashboard";
  }

  const rateKey = `${session.user.id}:${policy.key}:${guildId || "global"}`;
  const rateResult = checkRateLimit(rateKey, policy.rate);
  if (!rateResult.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests",
        retryAfterMs: Math.max(0, rateResult.resetAt - Date.now()),
      },
      withNoStoreHeaders({ status: 429 })
    );
  }

  const botApiUrl = runtimeConfig.dashboard.botApiUrl || "http://localhost:2000";

  try {
    const init =
      method === "POST"
        ? {
            method,
            headers: getBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(body),
            cache: "no-store",
          }
        : { method, headers: getBridgeHeaders(), cache: "no-store" };

    const res = await fetch(`${botApiUrl}/api/${path}`, { ...init, signal: AbortSignal.timeout(path === "play-batch" ? 120_000 : 30_000) });
    const rawBody = await res.text();

    let data;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {
        error: "Bot bridge returned a non-JSON response",
        details: rawBody.slice(0, 500),
      };
    }

    return NextResponse.json(data, withNoStoreHeaders({ status: res.status }));
  } catch (error) {
    console.error(`Bot API ${method} proxy failed for "${path}":`, error);
    return NextResponse.json({ error: "Failed to communicate with bot bridge" }, withNoStoreHeaders({ status: 500 }));
  }
}

export async function GET(req, { params }) {
  return proxyToBot(req, await params, "GET");
}

export async function POST(req, { params }) {
  return proxyToBot(req, await params, "POST");
}
