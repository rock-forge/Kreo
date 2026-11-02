"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Disc3, Heart, Loader2, Search, Trash2 } from "lucide-react";

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

export default function DashboardLibraryPage() {
  const [songs, setSongs] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadLibrary() {
      try {
        const response = await fetch("/api/user/liked", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setLoadError(data.error || "Could not load your library.");
          setSongs([]);
          return;
        }

        setSongs(Array.isArray(data.songs) ? data.songs : []);
      } catch (error) {
        if (mounted) {
          console.error(error);
          setLoadError("Could not load your library.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadLibrary();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => setFeedback(""), 2600);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const filteredSongs = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return songs;
    }

    return songs.filter((song) =>
      [song.title, song.author].some((value) => typeof value === "string" && value.toLowerCase().includes(query))
    );
  }, [filter, songs]);

  const summary = useMemo(() => {
    const authors = new Map();

    for (const song of songs) {
      const author = typeof song?.author === "string" && song.author.trim() ? song.author.trim() : "Unknown artist";
      authors.set(author, (authors.get(author) || 0) + 1);
    }

    return {
      totalSongs: songs.length,
      topArtists: [...authors.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([name, count]) => ({ name, count })),
      lastAddedAt: songs[0]?.addedAt || null,
    };
  }, [songs]);

  async function removeSong(url) {
    setBusyKey(url);

    try {
      const response = await fetch("/api/user/liked", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(data.error || "Could not remove that track.");
        return;
      }

      setSongs((prev) => prev.filter((song) => song.url !== url));
      setFeedback("Removed from your library.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not remove that track.");
    } finally {
      setBusyKey("");
    }
  }

  async function clearLibrary() {
    setBusyKey("__all__");

    try {
      const response = await fetch("/api/user/liked", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(data.error || "Could not clear your library.");
        return;
      }

      setSongs([]);
      setFeedback("Your library is clear now.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not clear your library.");
    } finally {
      setBusyKey("");
    }
  }

  if (loadError) return <div role="alert" className="studio-surface mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">Your library is taking a moment</h1><p className="mt-3 text-sm leading-7 text-[#a5a2b5]">{loadError}</p><button onClick={() => window.location.reload()} className="studio-button mt-6">Try again</button></div>;
  return (
    <div className="studio-page">
      {feedback && <div role="status" className="border-l-2 border-primary bg-primary/6 px-4 py-3 text-sm text-[#e8ddfa]">{feedback}</div>}
      <header className="grid gap-8 pb-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end lg:pb-12">
        <div><p className="studio-eyebrow">Your collection</p><h1 className="studio-title mt-3">Liked songs</h1><p className="studio-description mt-4 max-w-xl">The songs you keep coming back to. Saved for the next good moment.</p><div className="mt-7 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[#a5a2b5]"><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{summary.totalSongs}</strong> saved songs</span><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{summary.topArtists.length}</strong> top artists</span><span>Last saved {formatDate(summary.lastAddedAt)}</span></div></div>
        {summary.topArtists.length > 0 && <div className="hidden border-l border-white/10 pl-7 lg:block"><p className="text-xs text-[#878395]">Your most saved artist</p><p className="mt-3 break-words text-2xl font-semibold tracking-tight text-[#d7c4ff]">{summary.topArtists[0].name}</p><p className="mt-2 text-xs text-[#878395]">{summary.topArtists[0].count} in your collection</p></div>}
      </header>
      <div className="studio-toolbar flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="studio-input flex min-w-0 items-center gap-3 sm:max-w-sm sm:flex-1"><Search size={18} className="shrink-0 text-[#878395]" /><span className="sr-only">Search your liked songs</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search your collection" className="w-full min-w-0 bg-transparent text-sm text-white outline-none" /></label>
        <div className="flex items-center justify-between gap-5 sm:justify-end"><Link href="/dashboard/playlists" className="studio-button-quiet">Your playlists</Link><button onClick={clearLibrary} disabled={songs.length === 0 || busyKey === "__all__"} className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[#9c91a7] transition hover:text-red-300 disabled:opacity-40">{busyKey === "__all__" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Clear library</button></div>
      </div>
      {loading ? <div className="flex items-center gap-3 py-16 text-sm text-[#a5a2b5]"><Loader2 size={18} className="animate-spin text-primary" />Loading your collection…</div> : filteredSongs.length === 0 ? (
        <section className="border-t border-white/8 py-20 text-center"><Heart size={38} strokeWidth={1.2} className="mx-auto mb-6 text-primary" /><h2 className="text-2xl font-semibold tracking-tight">{songs.length === 0 ? "Your next favorite is out there." : "No songs found."}</h2><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#a5a2b5]">{songs.length === 0 ? "Like a song while Kreo is playing to start your collection." : "Try another title or artist to find what you saved."}</p><Link href="/dashboard" className="studio-button mt-7 inline-flex">Find a server</Link></section>
      ) : (
        <section aria-label="Liked songs" className="studio-list border-t border-white/10"><div className="hidden grid-cols-[48px_minmax(0,1fr)_150px_44px] gap-5 px-2 py-4 text-[10px] uppercase tracking-[.14em] text-[#777184] md:grid"><span /><span>Song / artist</span><span>Saved</span><span /></div><div className="divide-y divide-white/7">{filteredSongs.map((song) => <article key={song.id} className="group grid grid-cols-[48px_minmax(0,1fr)_40px] items-center gap-3 py-4 transition sm:gap-5 md:grid-cols-[48px_minmax(0,1fr)_150px_44px] md:px-2"><div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-primary/8">{song.thumbnail ? <img src={song.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Disc3 size={22} className="text-primary/60" /></div>}</div><div className="min-w-0"><a href={song.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-[#f5f4ff] transition hover:text-primary">{song.title}</a><p className="mt-1.5 truncate text-xs text-[#9690a3]">{song.author || "Unknown artist"}</p></div><p className="hidden text-xs text-[#878395] md:block">{formatDate(song.addedAt)}</p><button aria-label={`Remove ${song.title} from liked songs`} onClick={() => removeSong(song.url)} disabled={busyKey === song.url} className="grid h-10 w-10 place-items-center rounded-full text-[#777184] transition hover:bg-red-400/8 hover:text-red-300 disabled:opacity-40">{busyKey === song.url ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></article>)}</div></section>
      )}
    </div>
  );
}
