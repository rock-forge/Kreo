"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  Search as SearchIcon,
} from "lucide-react";
import { useSession } from "next-auth/react";

const defaultSuggestions = [
  "Night drive phonk",
  "Spotify viral hits 2026",
  "Bollywood lofi mix",
  "Anime openings",
  "Drift phonk playlist",
  "Chill house mix",
];

const discoveryShelves = [
  {
    title: "Mood starters",
    items: [
      { name: "Late night coding", query: "late night coding music" },
      { name: "Party queue", query: "party hits playlist" },
      { name: "Anime energy", query: "anime mix hype" },
      { name: "Bass boosted", query: "bass boosted songs" },
    ],
  },
  {
    title: "Quick picks",
    items: [
      { name: "Arijit Singh mix", query: "Arijit Singh mashup" },
      { name: "Gaming montage", query: "gaming montage songs" },
      { name: "Soft lofi", query: "soft lofi playlist" },
      { name: "Workout rap", query: "workout rap mix" },
    ],
  },
];

const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function formatDuration(ms) {
  const duration = Number(ms);

  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_TRACK_DURATION_MS) {
    return "--:--";
  }

  const totalSeconds = Math.floor(duration / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function SearchPage() {
  const params = useParams();
  const guildId = params.id;
  const { data: session } = useSession();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTrackUri, setActiveTrackUri] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const searchRequest = useRef(null);
  const playRequest = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("kreo:recentSearches") || "[]");
      queueMicrotask(() => setRecentSearches(Array.isArray(saved) ? saved.filter(item => typeof item === "string").slice(0, 6) : []));
    } catch {}
    return () => searchRequest.current?.abort();
  }, [guildId]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setFeedback(null);
    }, 3500);

    return () => clearTimeout(timeout);
  }, [feedback]);

  function showFeedback(type, message) {
    setFeedback({ type, message });
  }

  function rememberSearch(searchTerm) {
    if (typeof window === "undefined") {
      return;
    }

    const trimmedQuery = searchTerm.trim();
    if (!trimmedQuery) {
      return;
    }

    setRecentSearches((prev) => {
      const next = [trimmedQuery, ...prev.filter((item) => item.toLowerCase() !== trimmedQuery.toLowerCase())].slice(0, 6);
      try {
        window.localStorage.setItem("kreo:recentSearches", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function clearRecentSearches() {
    setRecentSearches([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("kreo:recentSearches");
      } catch {}
    }
  }

  function cacheGuildTrack(track) {
    if (typeof window === "undefined" || !guildId || !track) {
      return;
    }

    try {
      window.localStorage.setItem(
        `kreo:lastTrack:${guildId}`,
        JSON.stringify({
          title: track.title || null,
          author: track.author || null,
          uri: track.uri || null,
          length: Number(track.length) || 0,
          thumbnail: track.thumbnail || null,
          requester: session?.user?.name || session?.user?.username || "Unknown user",
          cachedAt: Date.now(),
        })
      );
    } catch {}
  }

  async function searchTracks(searchTerm) {
    const trimmedQuery = searchTerm.trim();
    if (!trimmedQuery) {
      return;
    }

    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setLoading(true);
    setHasSearched(true);

    try {
      const response = await fetch("/api/bot/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmedQuery }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;

      if (!response.ok) {
        showFeedback("error", data.error || "Search failed. Try another track name.");
        setResults([]);
        return;
      }

      const tracks = Array.isArray(data?.results?.tracks) ? data.results.tracks : [];
      setResults(tracks);
      rememberSearch(trimmedQuery);

      if (tracks.length === 0) {
        showFeedback("info", `No results found for "${trimmedQuery}".`);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      showFeedback("error", "Could not reach the music search right now.");
      setResults([]);
    } finally {
      if (searchRequest.current === controller) setLoading(false);
    }
  }

  async function handlePlay(track) {
    if (playRequest.current) return;
    if (!session?.user?.id) {
      showFeedback("error", "Your Discord session is missing. Try logging in again.");
      return;
    }

    playRequest.current = true;
    setActiveTrackUri(track.uri);

    try {
      const response = await fetch("/api/bot/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          userId: session.user.id,
          track: {
            track: track.track,
            identifier: track.identifier,
            sourceName: track.sourceName,
            title: track.title,
            uri: track.uri,
            author: track.author,
            length: track.length,
            thumbnail: track.thumbnail,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        showFeedback("error", "Slow down a little. The queue action is on cooldown.");
        return;
      }

      if (data.status === "NO_VOICE_CHANNEL") {
        showFeedback("error", "Join a voice channel first, then try again.");
      } else if (data.status === "DIFFERENT_VOICE_CHANNEL") {
        showFeedback("error", "Kreo is already playing in another voice channel.");
      } else if (data.success) {
        cacheGuildTrack(track);
        showFeedback("success", `"${track.title}" was added to the queue.`);
      } else {
        showFeedback("error", data.error || "Failed to add that track.");
      }
    } catch (error) {
      console.error(error);
      showFeedback("error", "Error communicating with the bot bridge.");
    } finally {
      playRequest.current = false;
      setActiveTrackUri("");
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    searchTracks(query);
  }

  function handleSuggestion(suggestion) {
    setQuery(suggestion);
    searchTracks(suggestion);
  }

  const topResult = results[0] || null;
  const songRows = results.slice(0, 6);
  const moreResults = results.slice(6, 18);

  return (
    <div className="studio-page space-y-10 pb-10">
      {feedback && <div role="status" className={`flex items-center gap-3 border-l-2 px-4 py-3 text-sm ${feedback.type === "error" ? "border-red-300 bg-red-400/5 text-red-100" : "border-primary bg-primary/5 text-[#ded5ef]"}`}>{feedback.type === "success" ? <CheckCircle2 size={17} className="shrink-0 text-primary" /> : <AlertCircle size={17} className="shrink-0" />}<span>{feedback.message}</span></div>}
      <header className="max-w-4xl">
        <p className="studio-eyebrow">Discover</p>
        <h1 className="studio-title mt-3">Find your next <span className="text-primary">repeat.</span></h1>
        <p className="studio-description mt-4">Search a song, artist, playlist, or paste a link.</p>
        <form onSubmit={handleSearch} className="mt-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-stretch"><label className="flex min-h-16 min-w-0 flex-1 items-center gap-4 rounded-2xl bg-[#17151f] px-5 focus-within:ring-1 focus-within:ring-primary/50"><SearchIcon size={22} className="shrink-0 text-primary" /><input type="text" aria-label="Search music" maxLength={500} value={query} onChange={event => setQuery(event.target.value)} placeholder="What are we listening to?" className="min-w-0 w-full bg-transparent py-5 text-base text-white outline-none placeholder:text-[#777185]" /></label><button type="submit" disabled={loading} className="studio-button inline-flex min-h-14 items-center justify-center gap-2 px-7 text-sm disabled:opacity-50">{loading ? <Loader2 size={18} className="animate-spin" /> : <SearchIcon size={18} />}{loading ? "Searching…" : "Search"}</button></div></form>
        {!loading && results.length === 0 && <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-xs text-[#a5a2b5]">{defaultSuggestions.map(suggestion => <button key={suggestion} onClick={() => handleSuggestion(suggestion)} className="min-h-8 border-b border-transparent text-left transition hover:border-primary/50 hover:text-primary">{suggestion}</button>)}</div>}
        {!loading && results.length === 0 && recentSearches.length > 0 && <div className="mt-6 border-t border-white/7 pt-5"><div className="mb-3 flex items-center justify-between"><span className="text-xs text-[#777185]">Recently searched</span><button onClick={clearRecentSearches} className="min-h-8 text-xs text-[#a5a2b5] hover:text-white">Clear history</button></div><div className="flex flex-wrap gap-x-5 gap-y-2">{recentSearches.map(item => <button key={item} onClick={() => handleSuggestion(item)} className="max-w-full truncate py-1 text-sm text-[#cec7db] transition hover:text-primary">{item}</button>)}</div></div>}
      </header>
      {loading && <div aria-label="Searching for music" className="space-y-4 pt-4">{[1, 2, 3].map(item => <div key={item} className="flex animate-pulse items-center gap-4 border-b border-white/5 pb-4"><div className="h-14 w-14 rounded-lg bg-white/5" /><div className="h-4 w-2/5 rounded bg-white/5" /></div>)}</div>}
      {!loading && results.length > 0 && <>
        <div className="grid gap-10 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:gap-14">
          <section className="min-w-0"><p className="studio-eyebrow mb-5">Best match</p>{topResult && <div><div className="flex items-start gap-5 sm:gap-6 xl:flex-col"><img src={topResult.thumbnail || topResult.artworkUrl || "/branding/kreo-girl-v2.webp"} alt={topResult.title} className="aspect-square w-28 shrink-0 rounded-xl object-cover shadow-[0_18px_40px_rgba(0,0,0,0.25)] sm:w-40 xl:w-52" /><div className="min-w-0 pt-1 xl:pt-0"><h2 className="break-words text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{topResult.title}</h2><p className="mt-3 text-sm text-[#a5a2b5]">{topResult.author}</p><p className="mt-3 text-xs tabular-nums text-[#777185]">{formatDuration(topResult.length)}</p></div></div><button onClick={() => handlePlay(topResult)} disabled={Boolean(activeTrackUri)} className="studio-button mt-6 inline-flex min-h-12 items-center gap-3 px-6 text-sm disabled:opacity-50">{activeTrackUri === topResult.uri ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} fill="currentColor" />}Add to queue</button></div>}</section>
          <section className="min-w-0"><div className="mb-5 flex items-baseline justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight text-white">Songs</h2><span className="text-xs text-[#777185]">{results.length} results</span></div><div className="studio-list">{songRows.map((track, index) => <TrackRow key={`${track.uri || track.title}-${index}`} index={index + 1} track={track} isBusy={activeTrackUri === track.uri} disabled={Boolean(activeTrackUri)} onPlay={() => handlePlay(track)} />)}</div></section>
        </div>
        {moreResults.length > 0 && <section className="border-t border-white/7 pt-8"><h2 className="mb-6 text-xl font-semibold tracking-tight text-white">More to explore</h2><div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">{moreResults.map((track, index) => <button key={`${track.uri || track.title}-card-${index}`} onClick={() => handlePlay(track)} disabled={Boolean(activeTrackUri)} className="group min-w-0 text-left disabled:opacity-50"><div className="relative overflow-hidden rounded-xl bg-white/4"><img src={track.thumbnail || track.artworkUrl || "/branding/kreo-girl-v2.webp"} alt={track.title} className="aspect-square w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]" loading="lazy" /><span className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-[#c2a4ff] text-[#170d2a] shadow-lg">{activeTrackUri === track.uri ? <Loader2 size={17} className="animate-spin" /> : <Plus size={19} />}</span></div><h3 className="mt-4 truncate text-sm font-semibold text-white">{track.title}</h3><p className="mt-1 truncate text-xs text-[#a5a2b5]">{track.author}</p><p className="mt-2 text-[11px] tabular-nums text-[#777185]">{formatDuration(track.length)}</p></button>)}</div></section>}
      </>}
      {!loading && results.length === 0 && !query && <div className="grid gap-10 pt-2 xl:grid-cols-2 xl:gap-14">{discoveryShelves.map(shelf => <section key={shelf.title}><h2 className="mb-3 text-xl font-semibold tracking-tight text-white">{shelf.title}</h2><div>{shelf.items.map((item, index) => <button key={item.name} onClick={() => handleSuggestion(item.query)} className="group flex w-full items-center gap-5 border-b border-white/7 py-5 text-left transition hover:text-primary"><span className="text-xs tabular-nums text-[#615b70]">0{index + 1}</span><div className="min-w-0 flex-1"><p className="text-base font-medium text-[#e5e1ee] group-hover:text-primary">{item.name}</p><p className="mt-1.5 truncate text-xs text-[#777185]">{item.query}</p></div><ArrowUpRight size={19} className="shrink-0 text-[#777185] group-hover:text-primary" /></button>)}</div></section>)}</div>}
      {!loading && hasSearched && results.length === 0 && Boolean(query.trim()) && <section className="border-t border-white/7 py-12"><SearchIcon size={32} className="mb-6 text-primary" /><h2 className="text-2xl font-semibold tracking-tight text-white">Nothing matched that search.</h2><p className="mt-3 max-w-lg text-sm leading-7 text-[#a5a2b5]">Try another song, artist, or a direct link.</p></section>}
    </div>
  );
}

function TrackRow({ index, track, isBusy, disabled, onPlay }) {
  return <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/7 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
    <span className="hidden w-5 text-center text-xs tabular-nums text-[#615b70] sm:block">{String(index).padStart(2, "0")}</span>
    <div className="flex min-w-0 items-center gap-3.5"><img src={track.thumbnail || track.artworkUrl || "/branding/kreo-girl-v2.webp"} alt={track.title} className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" /><div className="min-w-0"><p className="truncate text-sm font-medium text-[#ece8f5]">{track.title}</p><p className="mt-1.5 truncate text-xs text-[#777185]">{track.author}</p></div></div>
    <span className="hidden text-xs tabular-nums text-[#777185] sm:block">{formatDuration(track.length)}</span>
    <button onClick={onPlay} disabled={disabled} aria-label={`Add ${track.title} to queue`} className="grid h-10 w-10 place-items-center rounded-full text-[#c2a4ff] transition hover:bg-primary/10 disabled:opacity-40">{isBusy ? <Loader2 size={17} className="animate-spin" /> : <Plus size={20} />}</button>
  </div>;
}

