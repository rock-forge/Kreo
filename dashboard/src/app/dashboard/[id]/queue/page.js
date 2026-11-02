"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Trash2, ListMusic, Play, Clock3, Loader2, AlertCircle, CheckCircle2, Search } from "lucide-react";
import { mergeTrackMetadata } from "@/lib/playerMetadata";

function formatDuration(ms) {
  const duration = Number(ms);

  if (!Number.isFinite(duration) || duration <= 0) {
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

export default function QueuePage() {
  const params = useParams();
  const guildId = params.id;
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [loadError, setLoadError] = useState("");
  const mutation = useRef({ busy: false, revision: 0 });

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    let fetching = false;

    const readCachedTrack = () => {
      if (typeof window === "undefined" || !guildId) {
        return null;
      }

      try {
        const rawValue = window.localStorage.getItem(`kreo:lastTrack:${guildId}`);
        return rawValue ? JSON.parse(rawValue) : null;
      } catch {
        return null;
      }
    };

    const writeCachedTrack = (track) => {
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
            requester:
              (typeof track.requester === "string" ? track.requester : track.requester?.username) || "Unknown user",
            cachedAt: Date.now(),
          })
        );
      } catch {}
    };

    async function fetchQueue() {
      if (fetching || mutation.current.busy) return;
      fetching = true;
      const revision = mutation.current.revision;
      try {
        const response = await fetch(`/api/bot/guild/${guildId}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        const data = await response.json().catch(() => ({}));

        if (!mounted || revision !== mutation.current.revision || mutation.current.busy) {
          return;
        }
        if (!response.ok || data.success === false) throw new Error(data.error || "Could not load the queue. Please try again.");
        setLoadError("");

        if (data.player) {
          setQueue(Array.isArray(data.player.queue) ? data.player.queue : []);
          const cachedTrack = readCachedTrack();
          const liveCurrent = data.player.current || null;
          const mergedCurrent = mergeTrackMetadata(liveCurrent, cachedTrack);

          if (mergedCurrent) {
            writeCachedTrack(mergedCurrent);
          }

          setCurrent(mergedCurrent);
        } else {
          setQueue([]);
          setCurrent(null);
        }
      } catch (error) {
        if (mounted && !controller.signal.aborted) {
          setLoadError(error.message || "Could not load the queue.");
        }
      } finally {
        fetching = false;
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [guildId]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(timeout);
  }, [feedback]);

  function showFeedback(type, message) {
    setFeedback({ type, message });
  }

  const currentRequester =
    typeof current?.requester === "string"
      ? current.requester
      : current?.requester?.username || "Unknown user";
  const queueDuration = queue.reduce((total, track) => {
    const length = Number(track?.length);
    return Number.isFinite(length) && length > 0 ? total + length : total;
  }, 0);

  async function handleRemove(index) {
    if (mutation.current.busy) return;
    mutation.current = { busy: true, revision: mutation.current.revision + 1 };
    setBusyAction(`remove:${index}`);
    const previousQueue = queue;
    setQueue((previous) => previous.filter((_, itemIndex) => itemIndex !== index));

    try {
      const response = await fetch("/api/bot/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          action: "removeTrack",
          payload: { index },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        setQueue(previousQueue);
        showFeedback("error", data.error || "Failed to remove track.");
        return;
      }
      showFeedback("success", "Track removed from queue.");
    } catch (error) {
      console.error("Failed to remove track", error);
      setQueue(previousQueue);
      showFeedback("error", "Failed to remove track.");
    } finally {
      mutation.current = { busy: false, revision: mutation.current.revision + 1 };
      setBusyAction("");
    }
  }

  async function handleClear() {
    if (queue.length === 0 || mutation.current.busy) {
      return;
    }

    mutation.current = { busy: true, revision: mutation.current.revision + 1 };
    setBusyAction("__clear__");
    const previousQueue = queue;
    setQueue([]);

    try {
      const response = await fetch("/api/bot/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId, action: "clearQueue" }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        setQueue(previousQueue);
        showFeedback("error", data.error || "Failed to clear queue.");
        return;
      }
      showFeedback("success", "Queue cleared.");
    } catch (error) {
      console.error("Failed to clear queue", error);
      setQueue(previousQueue);
      showFeedback("error", "Failed to clear queue.");
    } finally {
      mutation.current = { busy: false, revision: mutation.current.revision + 1 };
      setBusyAction("");
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        <div className="kreo-panel h-24 animate-pulse" />
        <div className="kreo-panel h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="studio-page mx-auto max-w-6xl space-y-9 pb-10">
      {loadError && <div role="alert" className="border-l-2 border-red-300 bg-red-400/5 px-4 py-3 text-sm text-red-100">{loadError} The queue will retry automatically.</div>}
      {feedback && <div role="status" className={`flex items-center gap-3 border-l-2 px-4 py-3 text-sm ${feedback.type === "success" ? "border-primary bg-primary/5 text-[#ded5ef]" : "border-red-300 bg-red-400/5 text-red-100"}`}>{feedback.type === "success" ? <CheckCircle2 size={17} className="shrink-0 text-primary" /> : <AlertCircle size={17} className="shrink-0" />}<span>{feedback.message}</span></div>}
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><p className="studio-eyebrow">Your listening session</p><h1 className="studio-title mt-3">Up next</h1><div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#a5a2b5]"><span><strong className="mr-1.5 font-medium text-white">{queue.length}</strong>tracks waiting</span><span className="text-[#615b70]" aria-hidden="true">/</span><span><strong className="mr-1.5 font-medium tabular-nums text-white">{formatDuration(queueDuration)}</strong>in the queue</span></div></div>
        {queue.length > 0 && <button onClick={handleClear} disabled={Boolean(busyAction) || Boolean(loadError)} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl px-3 text-sm text-[#d6a6b7] transition hover:bg-red-400/5 hover:text-red-200 disabled:opacity-40 sm:self-auto">{busyAction === "__clear__" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Clear queue</button>}
      </header>
      <section aria-label="Now playing" className="border-y border-white/7 py-7">
        {current ? <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7"><img src={current.thumbnail || "/branding/kreo-girl-v2.webp"} alt={current.title || "Current track cover"} className="h-28 w-28 shrink-0 rounded-xl object-cover shadow-[0_15px_40px_rgba(0,0,0,0.3)] sm:h-36 sm:w-36" /><div className="min-w-0 flex-1"><p className="mb-3 flex items-center gap-2 text-xs font-medium text-primary"><Play size={12} fill="currentColor" />Now playing</p><h2 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{current.title}</h2><p className="mt-2 truncate text-sm text-[#a5a2b5]">{current.author}</p><div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#777185]"><span>Requested by <span className="text-[#c4bdcf]">{currentRequester}</span></span><span className="inline-flex items-center gap-1.5 tabular-nums"><Clock3 size={12} />{formatDuration(current.length)}</span></div></div><Link href={`/dashboard/${guildId}`} className="studio-button-quiet inline-flex min-h-11 items-center justify-center gap-2 self-start px-4 text-sm sm:self-center"><Play size={14} />Open player</Link></div> : <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-medium text-[#e8e4ef]">Nothing is playing yet.</h2><p className="mt-2 text-sm text-[#777185]">Find a song to start your session.</p></div><Link href={`/dashboard/${guildId}/search`} className="studio-button inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm"><Search size={15} />Find music</Link></div>}
      </section>
      <section>
        <div className="mb-3 flex items-baseline justify-between"><h2 className="text-xl font-semibold tracking-tight text-white">Coming up</h2><span className="text-xs text-[#777185]">{queue.length} {queue.length === 1 ? "song" : "songs"}</span></div>
        {queue.length > 0 ? <div className="studio-list">{queue.map((track, index) => <div key={`${track.uri || track.title}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/7 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"><span className="hidden w-6 text-center text-xs tabular-nums text-[#615b70] sm:block">{String(index + 1).padStart(2, "0")}</span><div className="flex min-w-0 items-center gap-4"><img src={track.thumbnail || "/branding/kreo-girl-v2.webp"} alt={track.title || "Queued track cover"} className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" /><div className="min-w-0"><h3 className="truncate text-sm font-medium text-[#ece8f5]">{track.title}</h3><p className="mt-1.5 truncate text-xs text-[#777185]">{track.author}</p></div></div><span className="hidden min-w-14 text-right text-xs tabular-nums text-[#777185] sm:block">{formatDuration(track.length)}</span><button onClick={() => handleRemove(index)} disabled={Boolean(busyAction) || Boolean(loadError)} aria-label={`Remove ${track.title || "track"} from queue`} className="grid h-11 w-11 place-items-center rounded-full text-[#777185] transition hover:bg-red-400/5 hover:text-red-200 disabled:opacity-40">{busyAction === `remove:${index}` ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></div>)}</div> : <div className="py-12"><ListMusic size={30} className="mb-5 text-primary" /><h3 className="text-2xl font-semibold tracking-tight text-white">Room for your favorites.</h3><p className="mt-3 text-sm leading-7 text-[#a5a2b5]">Add a track and it will appear here.</p><Link href={`/dashboard/${guildId}/search`} className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:text-white">Explore music<Search size={15} /></Link></div>}
      </section>
    </div>
  );
}

