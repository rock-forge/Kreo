const Playlist = require("../schema/playlist.js");

const MAX_PLAYLISTS_PER_USER = 25;
const MAX_TRACKS_PER_PLAYLIST = 150;
const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function normalizePlaylistName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function sanitizeTrackLengthMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_TRACK_DURATION_MS) {
    return 0;
  }

  return numericValue;
}

function formatDuration(ms) {
  const safeMs = sanitizeTrackLengthMs(ms);
  if (!safeMs) {
    return "";
  }

  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTrackLengthMs(track) {
  if (!track || typeof track !== "object") {
    return 0;
  }

  const candidates = [
    track.length,
    track.duration,
    track.info?.length,
    track.raw?.info?.length,
    typeof track.getRaw === "function" ? track.getRaw()?.info?.length : undefined,
  ];

  for (const candidate of candidates) {
    const safeLength = sanitizeTrackLengthMs(candidate);
    if (safeLength > 0) {
      return safeLength;
    }
  }

  return 0;
}

function createPlaylistTrackSnapshot(track) {
  const safeLength = getTrackLengthMs(track);

  return {
    title: track?.title || "Unknown title",
    url: track?.uri || track?.url || "",
    duration: formatDuration(safeLength),
    thumbnail: track?.thumbnail || track?.artworkUrl || "",
    author: track?.author || "Unknown artist",
    identifier: track?.identifier || "",
    sourceName: track?.sourceName || "",
    addedAt: new Date(),
  };
}

async function getUserPlaylistDocument(userId) {
  let document = await Playlist.findOne({ userId });
  if (!document) {
    document = new Playlist({ userId, playlists: [] });
  }

  if (!Array.isArray(document.playlists)) {
    document.playlists = [];
  }

  return document;
}

function findPlaylist(document, playlistNameOrId) {
  if (!document || !Array.isArray(document.playlists)) {
    return null;
  }

  const normalizedName = normalizePlaylistName(playlistNameOrId);
  return (
    document.playlists.find((playlist) => String(playlist?._id) === String(playlistNameOrId || "")) ||
    document.playlists.find((playlist) => playlist.normalizedName === normalizedName) ||
    null
  );
}

function touchPlaylist(playlist) {
  if (!playlist) {
    return;
  }

  playlist.updatedAt = new Date();
}

async function queuePlaylistTracks(player, entries, requester, source = "playlist") {
  const songs = Array.isArray(entries) ? entries : [];
  let addedCount = 0;
  let failedCount = 0;

  for (const entry of songs) {
    const searchQuery =
      entry?.url ||
      (entry?.identifier ? `https://www.youtube.com/watch?v=${entry.identifier}` : null) ||
      [entry?.title, entry?.author].filter(Boolean).join(" ").trim();

    if (!searchQuery) {
      failedCount++;
      continue;
    }

    try {
      const result = await player.search(searchQuery, { requester });
      const track = result?.tracks?.[0];
      if (!track) {
        failedCount++;
        continue;
      }

      track.requestSource = source;
      player.queue.add(track);
      addedCount++;
    } catch {
      failedCount++;
    }
  }

  return {
    addedCount,
    failedCount,
  };
}

module.exports = {
  MAX_PLAYLISTS_PER_USER,
  MAX_TRACKS_PER_PLAYLIST,
  normalizePlaylistName,
  sanitizeTrackLengthMs,
  formatDuration,
  getTrackLengthMs,
  createPlaylistTrackSnapshot,
  getUserPlaylistDocument,
  findPlaylist,
  touchPlaylist,
  queuePlaylistTracks,
};
