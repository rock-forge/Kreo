import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { fetchDiscordGuilds } from "@/lib/discordAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const guilds = await fetchDiscordGuilds(session.accessToken);
    return NextResponse.json(guilds, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error("Failed to fetch cached Discord guilds", error);
    return NextResponse.json({ error: "Failed to fetch guilds" }, { status: 502 });
  }
}
