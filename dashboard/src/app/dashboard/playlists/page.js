"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Disc3,
  Heart,
  Loader2,
  Music4,
  Play,
  Plus,
  Search,
  Server,
  Trash2,
} from "lucide-react";

const LIKED_PLAYLIST_ID = "__kreo_liked_music__";

function formatDate(value) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 86_400_000) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sortPlaylists(playlists) {
  return [...(Array.isArray(playlists) ? playlists : [])].sort(
    (left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)
  );
}

function mapLikedSongToPlaylistSong(song, index) {
  return {
    id: song?.id || `liked:${song?.url || index}:${index}`,
    title: song?.title || "Unknown title",
    url: song?.url || "",
    duration: song?.duration || "",
    thumbnail: song?.thumbnail || "",
    author: song?.author || "Unknown artist",
    identifier: song?.identifier || "",
    sourceName: song?.sourceName || "",
    addedAt: song?.addedAt || null,
  };
}

async function fetchLikedSongs() {
  const response = await fetch("/api/user/liked", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Could not load liked songs.");
  }

  return Array.isArray(data?.songs) ? data.songs : [];
}

export default function DashboardPlaylistsPage() {
  const [playlists, setPlaylists] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [summary, setSummary] = useState({ totalPlaylists: 0, totalSongs: 0, updatedAt: null });
  const [joinedServers, setJoinedServers] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [playlistsRes, guildsRes, likedRes] = await Promise.all([
          fetch("/api/user/playlists", { cache: "no-store" }),
          fetch("/api/discord/guilds", { cache: "no-store" }),
          fetch("/api/user/liked", { cache: "no-store" }),
        ]);

        const playlistData = await playlistsRes.json().catch(() => ({}));
        if (!playlistsRes.ok) throw new Error(playlistData.error || "Could not load your playlists. Please try again.");
        if (!likedRes.ok || !guildsRes.ok) throw new Error("Your music library and servers could not be loaded. Please try again.");
        const guilds = guildsRes.ok ? await guildsRes.json().catch(() => []) : [];
        const likedData = likedRes.ok ? await likedRes.json().catch(() => ({})) : {};
        let joinedGuildIds = [];

        if (Array.isArray(guilds) && guilds.length > 0) {
          const botRes = await fetch("/api/bot/bot-guilds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guildIds: guilds.map((guild) => guild.id) }),
          });
          joinedGuildIds = botRes.ok ? await botRes.json().catch(() => []) : [];
        }

        if (!mounted) {
          return;
        }

        const safePlaylists = Array.isArray(playlistData?.playlists) ? playlistData.playlists : [];
        const safeLikedSongs = Array.isArray(likedData?.songs) ? likedData.songs : [];
        const safeJoinedServers = Array.isArray(guilds)
          ? guilds
              .filter((guild) => joinedGuildIds.includes(guild.id))
              .sort((left, right) => left.name.localeCompare(right.name))
          : [];

        setPlaylists(sortPlaylists(safePlaylists));
        setLikedSongs(safeLikedSongs);
        setSummary(playlistData?.summary || { totalPlaylists: safePlaylists.length, totalSongs: 0, updatedAt: null });
        setJoinedServers(safeJoinedServers);
        setSelectedPlaylistId((current) => {
          if (current === LIKED_PLAYLIST_ID || safePlaylists.some((playlist) => playlist.id === current)) {
            return current;
          }

          return LIKED_PLAYLIST_ID;
        });
        setSelectedGuildId((current) => current || safeJoinedServers[0]?.id || "");
      } catch (error) {
        if (mounted) setLoadError(error.message || "Could not load your playlists.");
        if (mounted) {
          setFeedback("Could not load your playlists.");
          setPlaylists([]);
          setLikedSongs([]);
          setJoinedServers([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function refreshLikedSongs() {
      try {
        const songs = await fetchLikedSongs();
        if (mounted) {
          setLikedSongs(songs);
        }
      } catch {
        // Keep background refresh quiet; first load handles user-facing errors.
      }
    }

    const interval = setInterval(refreshLikedSongs, 30_000);
    window.addEventListener("focus", refreshLikedSongs);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", refreshLikedSongs);
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => setFeedback(""), 2800);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const likedPlaylist = useMemo(
    () => ({
      id: LIKED_PLAYLIST_ID,
      name: "Liked Music",
      builtIn: true,
      songCount: likedSongs.length,
      createdAt: null,
      updatedAt: likedSongs[0]?.addedAt || null,
      songs: likedSongs.map(mapLikedSongToPlaylistSong),
    }),
    [likedSongs]
  );

  const playlistCollection = useMemo(() => [likedPlaylist, ...playlists], [likedPlaylist, playlists]);

  const selectedPlaylist = useMemo(
    () => playlistCollection.find((playlist) => playlist.id === selectedPlaylistId) || likedPlaylist,
    [likedPlaylist, playlistCollection, selectedPlaylistId]
  );

  const derivedSummary = useMemo(() => {
    const updatedAt =
      playlistCollection
        .map((playlist) => playlist.updatedAt)
        .filter(Boolean)
        .sort((left, right) => new Date(right) - new Date(left))[0] ||
      summary.updatedAt ||
      null;

    return {
      totalPlaylists: playlistCollection.length,
      totalSongs: playlistCollection.reduce((sum, playlist) => sum + (playlist.songCount || playlist.songs?.length || 0), 0),
      updatedAt,
    };
  }, [playlistCollection, summary.updatedAt]);

  async function createPlaylist() {
    const nextName = playlistName.trim();
    if (!nextName || busyKey) {
      return;
    }

    setBusyKey("create");

    try {
      const response = await fetch("/api/user/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: nextName }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(data.error || "Could not create that playlist.");
        return;
      }

      const playlist = data?.playlist;
      if (playlist) {
        setPlaylists((prev) => sortPlaylists([playlist, ...prev]));
        setSummary((prev) => ({
          ...prev,
          totalPlaylists: (prev.totalPlaylists || 0) + 1,
          updatedAt: playlist.updatedAt || new Date().toISOString(),
        }));
        setSelectedPlaylistId(playlist.id);
      }
      setPlaylistName("");
      setFeedback("Playlist created.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not create that playlist.");
    } finally {
      setBusyKey("");
    }
  }

  async function deletePlaylist(playlistId) {
    if (!playlistId || busyKey) {
      return;
    }

    if (playlistId === LIKED_PLAYLIST_ID) {
      setFeedback("Liked Music is managed from your liked songs.");
      return;
    }

    setBusyKey(`delete:${playlistId}`);

    try {
      const response = await fetch("/api/user/playlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(data.error || "Could not delete that playlist.");
        return;
      }

      setPlaylists((prev) => {
        const next = prev.filter((playlist) => playlist.id !== playlistId);
        setSelectedPlaylistId((current) => (current === playlistId ? next[0]?.id || LIKED_PLAYLIST_ID : current));
        return sortPlaylists(next);
      });
      setFeedback("Playlist deleted.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not delete that playlist.");
    } finally {
      setBusyKey("");
    }
  }

  async function removeTrack(trackId) {
    if (!selectedPlaylist || !trackId || busyKey) {
      return;
    }

    if (selectedPlaylist.builtIn) {
      setFeedback("Remove liked tracks from the Liked Songs page.");
      return;
    }

    setBusyKey(`track:${trackId}`);

    try {
      const response = await fetch("/api/user/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove-track",
          playlistId: selectedPlaylist.id,
          trackId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(data.error || "Could not remove that song.");
        return;
      }

      setPlaylists((prev) =>
        sortPlaylists(prev.map((playlist) => (playlist.id === selectedPlaylist.id ? data.playlist : playlist)))
      );
      setFeedback("Removed from playlist.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not remove that song.");
    } finally {
      setBusyKey("");
    }
  }

  async function addTrackToPlaylist() {
    if (!selectedPlaylist || !trackQuery.trim() || busyKey) {
      return;
    }

    if (selectedPlaylist.builtIn) {
      setFeedback("Like songs from the player or library to update Liked Music.");
      return;
    }

    setBusyKey("add-track");

    try {
      const searchRes = await fetch("/api/bot/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trackQuery.trim() }),
      });
      const searchData = await searchRes.json().catch(() => ({}));

      if (!searchRes.ok) {
        setFeedback(searchData.error || "Could not search for that track.");
        return;
      }

      const topTrack = searchData?.results?.tracks?.[0];
      if (!topTrack) {
        setFeedback("Nothing matched that search.");
        return;
      }

      const response = await fetch("/api/user/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-track",
          playlistId: selectedPlaylist.id,
          track: {
            title: topTrack.title,
            url: topTrack.uri,
            duration: formatDisplayDuration(topTrack.length),
            thumbnail: topTrack.thumbnail,
            author: topTrack.author,
            identifier: topTrack.identifier,
            sourceName: topTrack.sourceName,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(data.error || "Could not add that song.");
        return;
      }

      setPlaylists((prev) =>
        sortPlaylists(prev.map((playlist) => (playlist.id === selectedPlaylist.id ? data.playlist : playlist)))
      );
      setTrackQuery("");
      setFeedback("Song added to playlist.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not add that song.");
    } finally {
      setBusyKey("");
    }
  }

  async function playPlaylist(clearQueue = false) {
    if (!selectedPlaylist || !selectedGuildId || busyKey) {
      return;
    }

    const songsToQueue = Array.isArray(selectedPlaylist.songs)
      ? selectedPlaylist.songs.filter((song) => song.url || song.title || song.identifier)
      : [];

    if (!songsToQueue.length) {
      setFeedback("That playlist is empty.");
      return;
    }

    setBusyKey(clearQueue ? "play-now" : "queue");

    try {
      const response = await fetch("/api/bot/play-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuildId,
          clearQueue,
          tracks: songsToQueue.map((song) => ({
            url: song.url,
            title: song.title,
            identifier: song.identifier,
            sourceName: song.sourceName,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        setFeedback(data.error || "Could not queue that playlist in the selected server.");
        return;
      }

      setFeedback(
        clearQueue
          ? `Loaded ${data.addedCount} songs into the selected server.`
          : `Queued ${data.addedCount} songs in the selected server.`
      );
    } catch (error) {
      console.error(error);
      setFeedback("Could not play that playlist right now.");
    } finally {
      setBusyKey("");
    }
  }

  if (loadError) return <div role="alert" className="studio-surface mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">Your playlists are taking a moment</h1><p className="mt-3 text-sm leading-7 text-[#a5a2b5]">{loadError}</p><button onClick={() => window.location.reload()} className="studio-button mt-6">Try again</button></div>;
  return (
    <div className="studio-page">
      {feedback && <div role="status" className="border-l-2 border-primary bg-primary/6 px-4 py-3 text-sm text-[#e8ddfa]">{feedback}</div>}
      <header className="pb-8 lg:pb-12"><p className="studio-eyebrow">Made by you</p><h1 className="studio-title mt-3">Your playlists</h1><p className="studio-description mt-4 max-w-xl">A soundtrack for every version of your day.</p><div className="mt-7 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[#a5a2b5]"><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{derivedSummary.totalPlaylists}</strong> collections</span><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{derivedSummary.totalSongs}</strong> songs</span><span>{joinedServers.length} server{joinedServers.length === 1 ? "" : "s"} ready to listen</span><span>Updated {formatDate(derivedSummary.updatedAt)}</span></div></header>
      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 border-t border-white/10 pt-8 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-12">
        <aside className="min-w-0 space-y-8">
          <div><h2 className="text-sm font-semibold text-[#f5f4ff]">Make something new</h2><div className="mt-4 flex gap-2"><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} aria-label="New playlist name" placeholder="Name your playlist" className="studio-input min-w-0 flex-1 text-sm" /><button aria-label="Create playlist" onClick={createPlaylist} disabled={!playlistName.trim() || busyKey === "create"} className="studio-button !min-w-11 !px-3">{busyKey === "create" ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}</button></div></div>
          <div><div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-medium uppercase tracking-[.15em] text-[#878395]">Your collections</h2><span className="text-xs text-[#777184]">{playlistCollection.length}</span></div>
            {loading ? <div className="flex items-center gap-3 py-8 text-sm text-[#a5a2b5]"><Loader2 size={16} className="animate-spin text-primary" />Loading playlists…</div> : <div className="space-y-1">{playlistCollection.map((playlist) => {
              const active = selectedPlaylist?.id === playlist.id;
              const builtIn = Boolean(playlist.builtIn);
              return <button key={playlist.id} onClick={() => setSelectedPlaylistId(playlist.id)} aria-pressed={active} className={`flex min-w-0 w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition ${active ? "bg-primary/9 text-[#e8ddfa]" : "text-[#a5a2b5] hover:bg-white/3 hover:text-white"}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${builtIn ? "bg-gradient-to-br from-[#7c50ba] to-[#342147] text-[#eddaff]" : "bg-[#1b1726] text-[#b9a1d2]"}`}>{builtIn ? <Heart size={18} fill="currentColor" /> : <Disc3 size={21} strokeWidth={1.5} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{playlist.name}</span><span className="mt-1.5 block text-xs text-[#878395]">{playlist.songCount} song{playlist.songCount === 1 ? "" : "s"}{builtIn ? " · synced with likes" : ""}</span></span>{active && <Check size={14} className="shrink-0 text-primary" />}</button>;
            })}{playlists.length === 0 && <p className="px-3 pt-4 text-xs leading-6 text-[#777184]">Create a playlist to start building a collection of your own.</p>}</div>}
          </div>
        </aside>
        <div className="min-w-0">
          {!selectedPlaylist ? <div className="py-12 text-sm leading-7 text-[#a5a2b5]">Choose a playlist to start listening.</div> : <>
            <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-end">
              <div className="relative grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#73519a] via-[#46305d] to-[#20152f] text-[#e6caff] sm:h-32 sm:w-32">{selectedPlaylist.songs[0]?.thumbnail ? <img src={selectedPlaylist.songs[0].thumbnail} alt="" className="h-full w-full object-cover" /> : selectedPlaylist.builtIn ? <Heart size={44} fill="currentColor" strokeWidth={1} /> : <Disc3 size={54} strokeWidth={1} />}</div>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-medium uppercase tracking-[.16em] text-[#a38dbb]">{selectedPlaylist.builtIn ? "Your liked collection" : "Your playlist"}</p><h2 className="mt-3 [overflow-wrap:anywhere] text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{selectedPlaylist.name}</h2><p className="mt-3 text-xs text-[#878395]">{selectedPlaylist.songCount} song{selectedPlaylist.songCount === 1 ? "" : "s"}{selectedPlaylist.builtIn ? " · updates with your liked songs" : ` · updated ${formatDate(selectedPlaylist.updatedAt)}`}</p></div>
              {selectedPlaylist.builtIn ? <Link href="/dashboard/library" className="studio-button-quiet self-start text-xs sm:self-end">Manage liked songs</Link> : <button onClick={() => deletePlaylist(selectedPlaylist.id)} disabled={busyKey === `delete:${selectedPlaylist.id}`} className="inline-flex min-h-11 items-center gap-2 self-start text-xs text-[#96879e] transition hover:text-red-300 disabled:opacity-40 sm:self-end">{busyKey === `delete:${selectedPlaylist.id}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Delete playlist</button>}
            </div>
            <div className="my-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-7 border-y border-white/8 py-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">{selectedPlaylist.builtIn ? <><p className="text-xs font-medium text-[#d1c9dd]">Always in sync with your favorites.</p><p className="mt-2 max-w-sm text-xs leading-6 text-[#878395]">Like songs in the player and they will be ready to queue here.</p><Link href="/dashboard/library" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary"><Heart size={14} />Open liked songs</Link></> : <><label htmlFor="playlist-song-search" className="text-xs font-medium text-[#d1c9dd]">Add to the soundtrack</label><div className="mt-3 flex min-w-0 gap-2"><label className="studio-input flex min-w-0 flex-1 items-center gap-2"><Search size={16} className="shrink-0 text-[#878395]" /><input id="playlist-song-search" value={trackQuery} onChange={(event) => setTrackQuery(event.target.value)} placeholder="Song name or link" className="w-full min-w-0 bg-transparent text-sm text-white outline-none" /></label><button aria-label="Add song to playlist" onClick={addTrackToPlaylist} disabled={!trackQuery.trim() || busyKey === "add-track"} className="studio-button !px-4">{busyKey === "add-track" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}<span className="hidden sm:inline">Add song</span></button></div></>}</div>
              <div className="min-w-0"><p className="mb-3 text-xs font-medium text-[#d1c9dd]">Listen with your server</p><ServerPicker servers={joinedServers} selectedGuildId={selectedGuildId} onChange={setSelectedGuildId} /><div className="mt-3 flex flex-wrap gap-3"><button onClick={() => playPlaylist(true)} disabled={!selectedGuildId || busyKey === "queue" || busyKey === "play-now"} className="studio-button flex-1">{busyKey === "play-now" ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} fill="currentColor" />}Play now</button><button onClick={() => playPlaylist(false)} disabled={!selectedGuildId || busyKey === "queue" || busyKey === "play-now"} className="studio-button-quiet flex-1">{busyKey === "queue" ? <Loader2 size={16} className="animate-spin" /> : <Music4 size={16} />}Add to queue</button></div></div>
            </div>
            <section aria-label={`${selectedPlaylist.name} songs`}>
              {selectedPlaylist.songs.length === 0 ? <div className="py-12 text-center"><Music4 size={28} className="mx-auto mb-4 text-primary/70" /><h3 className="text-lg font-semibold">Every great mix starts with one song.</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[#878395]">{selectedPlaylist.builtIn ? "Like a track in the player and it will appear here." : "Search for your first track above to start this playlist."}</p></div> : <div className="divide-y divide-white/7">{selectedPlaylist.songs.map((song, index) => <article key={song.id} className="grid grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-3 py-4 sm:grid-cols-[20px_44px_minmax(0,1fr)_70px_40px] sm:gap-4"><span className="hidden text-xs tabular-nums text-[#777184] sm:block">{String(index + 1).padStart(2, "0")}</span><div className="h-11 w-11 overflow-hidden rounded-lg bg-white/4">{song.thumbnail ? <img src={song.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Disc3 size={20} className="text-primary/50" /></div>}</div><div className="min-w-0"><a href={song.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-[#f5f4ff] transition hover:text-primary">{song.title}</a><p className="mt-1.5 truncate text-xs text-[#9690a3]">{song.author || "Unknown artist"}</p></div><span className="hidden text-right text-xs tabular-nums text-[#878395] sm:block">{song.duration || "--:--"}</span>{selectedPlaylist.builtIn ? <Link href="/dashboard/library" aria-label={`Manage ${song.title} in liked songs`} className="grid h-10 w-10 place-items-center rounded-full text-[#878395] transition hover:bg-white/4 hover:text-primary"><Heart size={16} /></Link> : <button aria-label={`Remove ${song.title} from playlist`} onClick={() => removeTrack(song.id)} disabled={busyKey === `track:${song.id}`} className="grid h-10 w-10 place-items-center rounded-full text-[#878395] transition hover:bg-red-400/8 hover:text-red-300 disabled:opacity-40">{busyKey === `track:${song.id}` ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button>}</article>)}</div>}
            </section>
          </>}
        </div>
      </section>
    </div>
  );
}
function ServerPicker({ servers, selectedGuildId, onChange }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const selectedServer = servers.find((server) => server.id === selectedGuildId) || null;
  const hasServers = servers.length > 0;
  useEffect(() => {
    function handlePointerDown(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  function selectServer(serverId) {
    onChange(serverId);
    setOpen(false);
  }
  return (
    <div ref={pickerRef} className="relative min-w-0 max-w-full">
      <button type="button" onClick={() => hasServers && setOpen((current) => !current)} disabled={!hasServers} aria-haspopup="listbox" aria-expanded={open} className={`studio-input flex min-w-0 w-full items-center justify-between gap-3 text-left transition ${hasServers ? "text-[#ddd5e9] hover:bg-white/5" : "text-[#777184] opacity-60"}`}>
        <Server size={16} className="shrink-0 text-[#9e85bb]" /><span className="min-w-0 flex-1 truncate text-sm">{selectedServer?.name || (hasServers ? "Choose a server" : "No joined servers")}</span><ChevronDown size={16} className={`shrink-0 text-[#878395] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div role="listbox" aria-label="Joined servers" className="absolute right-0 z-40 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#17131e] p-1.5 shadow-xl">{servers.map((server) => {
        const active = server.id === selectedGuildId;
        return <button key={server.id} type="button" role="option" aria-selected={active} onClick={() => selectServer(server.id)} className={`flex min-h-11 min-w-0 w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${active ? "bg-primary/10 text-[#eee5fc]" : "text-[#aaa2b7] hover:bg-white/4 hover:text-white"}`}><span className="min-w-0 flex-1 truncate">{server.name}</span>{active && <Check size={15} className="shrink-0 text-primary" />}</button>;
      })}</div>}
    </div>
  );
}
function formatDisplayDuration(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const totalSeconds = Math.floor(numericValue / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
