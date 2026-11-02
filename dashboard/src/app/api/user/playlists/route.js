import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Playlist from "@/lib/models/Playlist";

export const dynamic = "force-dynamic";

const MAX_PLAYLISTS_PER_USER = 25;
const MAX_TRACKS_PER_PLAYLIST = 150;

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

function normalizePlaylistName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function mapPlaylist(playlist) {
  return {
    id: String(playlist._id),
    name: playlist.name || "Untitled playlist",
    songCount: Array.isArray(playlist.songs) ? playlist.songs.length : 0,
    createdAt: playlist.createdAt || null,
    updatedAt: playlist.updatedAt || null,
    songs: Array.isArray(playlist.songs)
      ? playlist.songs.map((song) => ({
          id: String(song._id),
          title: song.title || "Unknown title",
          url: song.url || "",
          duration: song.duration || "",
          thumbnail: song.thumbnail || "",
          author: song.author || "Unknown artist",
          identifier: song.identifier || "",
          sourceName: song.sourceName || "",
          addedAt: song.addedAt || null,
        }))
      : [],
  };
}

function getSummary(playlists) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  return {
    totalPlaylists: safePlaylists.length,
    totalSongs: safePlaylists.reduce((sum, playlist) => sum + (Array.isArray(playlist.songs) ? playlist.songs.length : 0), 0),
    updatedAt: safePlaylists[0]?.updatedAt || null,
  };
}

async function getPlaylistDocument(userId) {
  let doc = await Playlist.findOne({ userId });
  if (!doc) {
    doc = new Playlist({ userId, playlists: [] });
  }

  if (!Array.isArray(doc.playlists)) {
    doc.playlists = [];
  }

  return doc;
}

function findPlaylist(doc, playlistId, playlistName) {
  const normalizedName = normalizePlaylistName(playlistName);
  return (
    doc.playlists.find((playlist) => String(playlist._id) === String(playlistId || "")) ||
    doc.playlists.find((playlist) => playlist.normalizedName === normalizedName) ||
    null
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  try {
    await dbConnect();
    const doc = await Playlist.findOne({ userId: session.user.id }).lean();
    const playlists = Array.isArray(doc?.playlists)
      ? [...doc.playlists]
          .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
          .map(mapPlaylist)
      : [];

    return NextResponse.json(
      {
        playlists,
        summary: getSummary(playlists),
      },
      withNoStoreHeaders()
    );
  } catch (error) {
    console.error("Failed to fetch playlists", error);
    return NextResponse.json({ error: "Failed to fetch playlists" }, withNoStoreHeaders({ status: 500 }));
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action.trim() : "";

  try {
    await dbConnect();
    const doc = await getPlaylistDocument(session.user.id);

    if (action === "create") {
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "Playlist name is required" }, withNoStoreHeaders({ status: 400 }));
      }

      if (name.length > 40) {
        return NextResponse.json({ error: "Playlist name must be 40 characters or less" }, withNoStoreHeaders({ status: 400 }));
      }

      if (doc.playlists.length >= MAX_PLAYLISTS_PER_USER) {
        return NextResponse.json({ error: `Maximum ${MAX_PLAYLISTS_PER_USER} playlists reached` }, withNoStoreHeaders({ status: 400 }));
      }

      const normalizedName = normalizePlaylistName(name);
      const existing = doc.playlists.find((playlist) => playlist.normalizedName === normalizedName);
      if (existing) {
        return NextResponse.json({ error: "A playlist with that name already exists" }, withNoStoreHeaders({ status: 409 }));
      }

      doc.playlists.unshift({
        name,
        normalizedName,
        songs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await doc.save();
      const playlist = doc.playlists[0];
      return NextResponse.json({ success: true, playlist: mapPlaylist(playlist) }, withNoStoreHeaders());
    }

    if (action === "add-track") {
      const playlist = findPlaylist(doc, body?.playlistId, body?.playlistName);
      if (!playlist) {
        return NextResponse.json({ error: "Playlist not found" }, withNoStoreHeaders({ status: 404 }));
      }

      if (playlist.songs.length >= MAX_TRACKS_PER_PLAYLIST) {
        return NextResponse.json({ error: `This playlist already has ${MAX_TRACKS_PER_PLAYLIST} tracks` }, withNoStoreHeaders({ status: 400 }));
      }

      const track = body?.track || {};
      const title = typeof track?.title === "string" ? track.title.trim() : "";
      const url = typeof track?.url === "string" ? track.url.trim() : "";

      if (!title || !url) {
        return NextResponse.json({ error: "Track title and URL are required" }, withNoStoreHeaders({ status: 400 }));
      }

      const existing = playlist.songs.find((song) => song.url === url);
      if (existing) {
        return NextResponse.json({ error: "That track is already in this playlist" }, withNoStoreHeaders({ status: 409 }));
      }

      playlist.songs.push({
        title,
        url,
        duration: typeof track?.duration === "string" ? track.duration.trim() : "",
        thumbnail: typeof track?.thumbnail === "string" ? track.thumbnail.trim() : "",
        author: typeof track?.author === "string" ? track.author.trim() : "",
        identifier: typeof track?.identifier === "string" ? track.identifier.trim() : "",
        sourceName: typeof track?.sourceName === "string" ? track.sourceName.trim() : "",
        addedAt: new Date(),
      });
      playlist.updatedAt = new Date();

      await doc.save();
      return NextResponse.json({ success: true, playlist: mapPlaylist(playlist) }, withNoStoreHeaders());
    }

    return NextResponse.json({ error: "Unsupported action" }, withNoStoreHeaders({ status: 400 }));
  } catch (error) {
    console.error("Failed to update playlists", error);
    return NextResponse.json({ error: "Failed to update playlists" }, withNoStoreHeaders({ status: 500 }));
  }
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action.trim() : "";

  try {
    await dbConnect();
    const doc = await getPlaylistDocument(session.user.id);
    const playlist = findPlaylist(doc, body?.playlistId, body?.playlistName);
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, withNoStoreHeaders({ status: 404 }));
    }

    if (action === "rename") {
      const nextName = typeof body?.name === "string" ? body.name.trim() : "";
      if (!nextName) {
        return NextResponse.json({ error: "Playlist name is required" }, withNoStoreHeaders({ status: 400 }));
      }

      const normalizedName = normalizePlaylistName(nextName);
      const conflict = doc.playlists.find(
        (entry) => String(entry._id) !== String(playlist._id) && entry.normalizedName === normalizedName
      );
      if (conflict) {
        return NextResponse.json({ error: "Another playlist already uses that name" }, withNoStoreHeaders({ status: 409 }));
      }

      playlist.name = nextName;
      playlist.normalizedName = normalizedName;
      playlist.updatedAt = new Date();
      await doc.save();
      return NextResponse.json({ success: true, playlist: mapPlaylist(playlist) }, withNoStoreHeaders());
    }

    if (action === "remove-track") {
      const trackId = typeof body?.trackId === "string" ? body.trackId.trim() : "";
      if (!trackId) {
        return NextResponse.json({ error: "Track id is required" }, withNoStoreHeaders({ status: 400 }));
      }

      const beforeCount = playlist.songs.length;
      playlist.songs = playlist.songs.filter((song) => String(song._id) !== trackId);
      if (playlist.songs.length === beforeCount) {
        return NextResponse.json({ error: "Track not found" }, withNoStoreHeaders({ status: 404 }));
      }

      playlist.updatedAt = new Date();
      await doc.save();
      return NextResponse.json({ success: true, playlist: mapPlaylist(playlist) }, withNoStoreHeaders());
    }

    return NextResponse.json({ error: "Unsupported action" }, withNoStoreHeaders({ status: 400 }));
  } catch (error) {
    console.error("Failed to patch playlist", error);
    return NextResponse.json({ error: "Failed to update playlist" }, withNoStoreHeaders({ status: 500 }));
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, withNoStoreHeaders({ status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const playlistId = typeof body?.playlistId === "string" ? body.playlistId.trim() : "";

  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id is required" }, withNoStoreHeaders({ status: 400 }));
  }

  try {
    await dbConnect();
    const doc = await getPlaylistDocument(session.user.id);
    const beforeCount = doc.playlists.length;
    doc.playlists = doc.playlists.filter((playlist) => String(playlist._id) !== playlistId);
    if (doc.playlists.length === beforeCount) {
      return NextResponse.json({ error: "Playlist not found" }, withNoStoreHeaders({ status: 404 }));
    }

    await doc.save();
    return NextResponse.json({ success: true }, withNoStoreHeaders());
  } catch (error) {
    console.error("Failed to delete playlist", error);
    return NextResponse.json({ error: "Failed to delete playlist" }, withNoStoreHeaders({ status: 500 }));
  }
}
