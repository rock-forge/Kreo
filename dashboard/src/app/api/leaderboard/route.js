import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { runtimeConfig } from "@/lib/runtimeConfig";

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

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  try {
    const botApiUrl = runtimeConfig.dashboard.botApiUrl || "http://localhost:2000";
    const response = await fetch(`${botApiUrl}/api/leaderboard`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        ...(runtimeConfig.dashboard.bridgeSecret
          ? { "x-kreo-bridge-secret": runtimeConfig.dashboard.bridgeSecret }
          : {}),
      },
    });

    const rawBody = await response.text();
    const data = rawBody ? JSON.parse(rawBody) : {};

    return NextResponse.json(data, withNoStoreHeaders({ status: response.status }));
  } catch (error) {
    console.error("Failed to fetch leaderboard", error);
    return NextResponse.json({ error: "Failed to fetch live leaderboard" }, withNoStoreHeaders({ status: 500 }));
  }
}
