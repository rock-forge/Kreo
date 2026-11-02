"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Disc3, Heart, Loader2, Radio } from "lucide-react";

export default function GlobalLeaderboardPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [memberGuildIds, setMemberGuildIds] = useState([]);
  const [busyLikeUri, setBusyLikeUri] = useState("");
  const [feedback, setFeedback] = useState("");
  const [likedUris, setLikedUris] = useState(() => new Set());

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [leaderboardRes, guildsRes] = await Promise.all([
          fetch("/api/leaderboard", { cache: "no-store" }),
          fetch("/api/discord/guilds", { cache: "no-store" }),
        ]);

        const leaderboardData = await leaderboardRes.json().catch(() => ({}));
        if (!leaderboardRes.ok || !guildsRes.ok) throw new Error("Live activity could not be loaded. Retrying shortly.");
        const guildsData = await guildsRes.json().catch(() => []);
        const likedData = await fetch("/api/user/liked", { cache: "no-store" })
          .then((response) => response.json().catch(() => ({})))
          .catch(() => ({}));

        if (!mounted) {
          return;
        }

        setEntries(Array.isArray(leaderboardData.entries) ? leaderboardData.entries : []);
        setLoadError("");
        setMemberGuildIds(Array.isArray(guildsData) ? guildsData.map((guild) => guild.id) : []);
        const songs = Array.isArray(likedData?.songs) ? likedData.songs : [];
        setLikedUris(new Set(songs.map((song) => song.url).filter(Boolean)));
      } catch (error) {
        if (mounted) {
          console.error(error);
          setLoadError("Live activity could not be loaded. Retrying shortly.");
          setEntries([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    const refreshInterval = setInterval(loadData, 8000);
    return () => {
      mounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => setFeedback(""), 2600);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const summary = useMemo(() => {
    const totalListeners = entries.reduce((sum, entry) => sum + (Number(entry.listeners) || 0), 0);
    const totalQueued = entries.reduce((sum, entry) => sum + (Number(entry.queueCount) || 0), 0);
    return {
      activeServers: entries.length,
      totalListeners,
      totalQueued,
    };
  }, [entries]);

  async function likeTrack(track) {
    if (!track?.uri || busyLikeUri === track.uri) {
      return;
    }

    setBusyLikeUri(track.uri);

    try {
      const response = await fetch("/api/user/liked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.title,
          url: track.uri,
          author: track.author,
          thumbnail: track.thumbnail,
          duration: "",
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(data.error || "Could not update your library.");
        return;
      }

      const nextLiked = Boolean(data?.liked);
      setLikedUris((prev) => {
        const next = new Set(prev);
        if (nextLiked) {
          next.add(track.uri);
        } else {
          next.delete(track.uri);
        }
        return next;
      });
      setFeedback(nextLiked ? "Saved to your library." : "Removed from your library.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not update your library.");
    } finally {
      setBusyLikeUri("");
    }
  }

  return (
    <div className="studio-page">
      {loadError && <div role="alert" className="border-l-2 border-primary bg-primary/6 px-4 py-3 text-sm text-[#e8ddfa]">{loadError}</div>}
      {feedback && <div role="status" className="border-l-2 border-primary bg-primary/6 px-4 py-3 text-sm text-[#e8ddfa]">{feedback}</div>}
      <header className="grid gap-8 pb-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end lg:pb-12">
        <div><p className="studio-eyebrow">Shared listening</p><h1 className="studio-title mt-3">Live activity</h1><p className="studio-description mt-4 max-w-xl">A look into the rooms where the music is happening.</p><div className="mt-7 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[#a5a2b5]"><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{summary.activeServers}</strong> active servers</span><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{summary.totalListeners}</strong> listening together</span><span><strong className="mr-1.5 font-semibold text-[#f5f4ff]">{summary.totalQueued}</strong> songs coming up</span></div></div>
        <div className="hidden border-l border-white/10 pl-7 lg:block"><p className="text-xs text-[#878395]">In the moment</p><p className="mt-2 text-6xl font-semibold tracking-[-.07em] text-[#d7c4ff]">{summary.totalListeners}</p><p className="mt-2 text-xs text-[#878395]">people sharing a soundtrack</p></div>
      </header>
      {loading ? <div className="flex items-center gap-3 border-t border-white/8 py-16 text-sm text-[#a5a2b5]"><Loader2 size={18} className="animate-spin text-primary" />Finding the listening rooms…</div> : entries.length === 0 ? (
        <section className="border-t border-white/8 py-20 text-center"><Radio size={42} strokeWidth={1.2} className="mx-auto mb-6 text-primary" /><h2 className="text-2xl font-semibold tracking-tight">A little quiet right now.</h2><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#a5a2b5]">Start listening with Kreo in a server and your session will appear here.</p><Link href="/dashboard" className="studio-button mt-7 inline-flex">Find your server</Link></section>
      ) : (
        <section aria-label="Active listening rooms" className="border-t border-white/10 divide-y divide-white/8">
          {entries.map((entry, index) => {
            const canOpen = memberGuildIds.includes(entry.guildId);
            const liked = likedUris.has(entry.current?.uri);
            return (
              <article key={`${entry.guildId}-${index}`} className="py-7 sm:py-8">
                <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
                  <div className="flex min-w-0 items-center gap-4 sm:gap-6">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-primary/8 sm:h-24 sm:w-24">{entry.current?.thumbnail ? <img src={entry.current.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Disc3 size={32} className="text-primary/60" /></div>}</div>
                    <div className="min-w-0"><div className="mb-2.5 flex min-w-0 items-center gap-2.5 text-[11px] text-[#a5a2b5]">{entry.guildIcon && <img src={entry.guildIcon} alt="" className="h-4 w-4 shrink-0 rounded-sm object-cover" />}<span className="truncate">{entry.guildName}</span><span className="ml-auto shrink-0 text-[#c2a4ff] sm:ml-2">{entry.paused ? "Paused" : "Playing"}</span></div><h2 className="truncate text-lg font-semibold tracking-tight text-[#f5f4ff] sm:text-2xl">{entry.current?.title}</h2><p className="mt-2 truncate text-sm text-[#9690a3]">{entry.current?.author || "Unknown artist"}</p></div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-0 xl:pl-6"><button onClick={() => likeTrack(entry.current)} disabled={busyLikeUri === entry.current?.uri} aria-label={liked ? "Remove song from liked songs" : "Save song to liked songs"} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${liked ? "bg-primary/10 text-primary" : "text-[#9690a3] hover:bg-white/5 hover:text-primary"}`}>{busyLikeUri === entry.current?.uri ? <Loader2 size={18} className="animate-spin" /> : <Heart size={18} fill={liked ? "currentColor" : "none"} />}</button>{canOpen ? <Link href={`/dashboard/${entry.guildId}`} className="studio-button">Enter session</Link> : <span className="text-xs text-[#878395]">View only</span>}</div>
                </div>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#878395] sm:pl-30"><span>{entry.voiceChannel || "Voice channel"}</span><span>{entry.listeners} listening</span><span>{entry.queueCount} in queue</span><span>{entry.sessionPlays} session tracks</span><span>Volume {entry.volume}%</span><span>Requested by {entry.current?.requester || "Unknown"}</span></div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}