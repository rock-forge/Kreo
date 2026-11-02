import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Liked from "@/lib/models/Liked";

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

function getLibrarySummary(songs) {
  const safeSongs = Array.isArray(songs) ? songs : [];
  const authors = new Map();

  for (const song of safeSongs) {
    const author = typeof song?.author === "string" && song.author.trim() ? song.author.trim() : "Unknown artist";
    authors.set(author, (authors.get(author) || 0) + 1);
  }

  const topArtists = [...authors.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  return {
    totalSongs: safeSongs.length,
    topArtists,
    lastAddedAt: safeSongs[0]?.addedAt || null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  try {
    await dbConnect();
    const liked = await Liked.findOne({ userId: session.user.id }).lean();
    const songs = Array.isArray(liked?.songs)
      ? [...liked.songs]
          .sort((left, right) => new Date(right.addedAt || 0) - new Date(left.addedAt || 0))
          .map((song, index) => ({
            id: `${song.url}:${index}`,
            title: song.title || "Unknown title",
            url: song.url || "",
            duration: song.duration || "",
            thumbnail: song.thumbnail || "",
            author: song.author || "Unknown artist",
            addedAt: song.addedAt || null,
          }))
      : [];

    return NextResponse.json(
      {
        songs,
        summary: getLibrarySummary(songs),
      },
      withNoStoreHeaders()
    );
  } catch (error) {
    console.error("Failed to fetch liked songs", error);
    return NextResponse.json({ error: "Failed to fetch liked songs" }, withNoStoreHeaders({ status: 500 }));
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const author = typeof body?.author === "string" ? body.author.trim() : "";
  const thumbnail = typeof body?.thumbnail === "string" ? body.thumbnail.trim() : "";
  const duration = typeof body?.duration === "string" ? body.duration.trim() : "";

  if (!title || !url) {
    return NextResponse.json({ error: "Missing required song details" }, withNoStoreHeaders({ status: 400 }));
  }

  try {
    await dbConnect();

    let liked = await Liked.findOne({ userId: session.user.id });
    if (!liked) {
      liked = new Liked({ userId: session.user.id, songs: [] });
    }

    const alreadyLikedIndex = (liked.songs || []).findIndex((song) => song.url === url);

    if (alreadyLikedIndex >= 0) {
      liked.songs.splice(alreadyLikedIndex, 1);
      await liked.save();

      return NextResponse.json(
        { success: true, liked: false, action: "unliked" },
        withNoStoreHeaders()
      );
    }

    liked.songs.unshift({
      title,
      url,
      author,
      thumbnail,
      duration,
      addedAt: new Date(),
    });

    await liked.save();

    return NextResponse.json(
      { success: true, liked: true, action: "liked" },
      withNoStoreHeaders()
    );
  } catch (error) {
    console.error("Failed to save liked song", error);
    return NextResponse.json({ error: "Failed to save liked song" }, withNoStoreHeaders({ status: 500 }));
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const targetUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const clearAll = Boolean(body?.clearAll);

  if (!clearAll && !targetUrl) {
    return NextResponse.json({ error: "Missing song URL" }, withNoStoreHeaders({ status: 400 }));
  }

  try {
    await dbConnect();
    const liked = await Liked.findOne({ userId: session.user.id });

    if (!liked) {
      return NextResponse.json({ success: true, removed: 0 }, withNoStoreHeaders());
    }

    const beforeCount = Array.isArray(liked.songs) ? liked.songs.length : 0;

    if (clearAll) {
      liked.songs = [];
    } else {
      liked.songs = (liked.songs || []).filter((song) => song.url !== targetUrl);
    }

    await liked.save();

    return NextResponse.json(
      {
        success: true,
        removed: clearAll ? beforeCount : Math.max(beforeCount - liked.songs.length, 0),
      },
      withNoStoreHeaders()
    );
  } catch (error) {
    console.error("Failed to update liked songs", error);
    return NextResponse.json({ error: "Failed to update liked songs" }, withNoStoreHeaders({ status: 500 }));
  }
}
