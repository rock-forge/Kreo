"use client";


import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
import { Play, Pause, SkipForward, Search, ListMusic, Heart, Loader2, Captions, Copy, ExternalLink, Volume1, Volume2, Keyboard } from "lucide-react";
import StudioArtwork from "@/components/StudioArtwork";
import { mergeTrackMetadata } from "@/lib/playerMetadata";
import "./player.css";

const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function sanitizePositionMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.min(numericValue, MAX_TRACK_DURATION_MS);
}

function sanitizeTrackLengthMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_TRACK_DURATION_MS) {
    return 0;
  }

  return numericValue;
}

function getRealtimeNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    const currentTick = performance.now();
    if (Number.isFinite(currentTick) && currentTick >= 0) {
      return currentTick;
    }
  }

  return Date.now();
}

function shareableTrackUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch { return ""; }
}

function ignoresPlayerShortcut(event) {
  return event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    Boolean(event.target?.closest?.("input, textarea, select, button, a, [role='button'], [contenteditable]:not([contenteditable='false']), dialog, [role='dialog']")) ||
    Boolean(document.querySelector("dialog[open], [role='dialog'][aria-modal='true']"));
}

export default function ServerPlayerPage() {
  const params = useParams();
  const guildId = params.id;
  const [playerState, setPlayerState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [positionState, setPositionState] = useState({
    positionMs: 0,
    syncedAt: 0,
  });
  const [clockTick, setClockTick] = useState(() => getRealtimeNow());
  const [feedback, setFeedback] = useState("");
  const [liking, setLiking] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [volumeDraft, setVolumeDraft] = useState(null);
  const [stageVisible, setStageVisible] = useState(false);
  const [likedUris, setLikedUris] = useState(() => new Set());
  const [lyricsState, setLyricsState] = useState({
    loading: false,
    available: false,
    plain: [],
    synced: [],
    source: "",
  });
  const [dragPositionMs, setDragPositionMs] = useState(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const seekValueRef = useRef(0);
  const seekDirtyRef = useRef(false);
  const seekFrameRef = useRef(null);
  const volumeValueRef = useRef(80);
  const volumeDirtyRef = useRef(false);
  const stageRef = useRef(null);
  const actionRequest = useRef(false);
  const refreshPlayerStateRef = useRef(async () => {});
  const livePositionRef = useRef(0);
  const playbackMetaRef = useRef({
    currentUri: "",
    playing: false,
    paused: false,
    seeking: false,
  });

  function resolveIncomingPosition(positionMs, options = {}) {
    const incomingPosition = sanitizePositionMs(positionMs);
    const { force = false } = options;
    const playbackMeta = playbackMetaRef.current;

    if (force || playbackMeta.seeking || !playbackMeta.playing || playbackMeta.paused) {
      return incomingPosition;
    }

    const currentLivePosition = livePositionRef.current;
    if (!playbackMeta.currentUri) {
      return incomingPosition;
    }

    const driftFromLocalClock = incomingPosition - currentLivePosition;
    if (Math.abs(driftFromLocalClock) >= 2500) {
      return incomingPosition;
    }

    return currentLivePosition;
  }

  useEffect(() => {
    let isMounted = true;
    let newSocket;
    let stateRequest = null;
    const controller = new AbortController();

    const readCachedTrack = () => {
      if (typeof window === "undefined" || !guildId) {
        return null;
      }

      try {
        const rawValue = window.localStorage.getItem(`kreo:lastTrack:${guildId}`);
        if (!rawValue) {
          return null;
        }

        return JSON.parse(rawValue);
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
            length: sanitizeTrackLengthMs(track.length),
            thumbnail: track.thumbnail || null,
            requester:
              (typeof track.requester === "string" ? track.requester : track.requester?.username) || "Unknown user",
            cachedAt: Date.now(),
          })
        );
      } catch {}
    };

    const getMergedTrackLength = (nextLength, fallbackLength = 0) => {
      const safeNextLength = sanitizeTrackLengthMs(nextLength);
      if (safeNextLength > 0) {
        return safeNextLength;
      }

      return sanitizeTrackLengthMs(fallbackLength);
    };

    const sanitizePlayerState = (player) => {
      if (!player) {
        return null;
      }

      const cachedTrack = readCachedTrack();
      const mergedCurrent = mergeTrackMetadata(player.current, cachedTrack);
      if (mergedCurrent) mergedCurrent.length = sanitizeTrackLengthMs(mergedCurrent.length);

      if (mergedCurrent) {
        writeCachedTrack(mergedCurrent);
      }

      return {
        ...player,
        position: sanitizePositionMs(player.position),
        capturedAt: Number(player.capturedAt) || 0,
        current: mergedCurrent,
        queue: Array.isArray(player.queue)
          ? player.queue.map((track) => ({
              ...track,
              length: sanitizeTrackLengthMs(track.length),
            }))
          : [],
      };
    };

    async function fetchPlayerState() {
      const stateRes = await fetch(`/api/bot/guild/${guildId}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      const stateData = await stateRes.json();
      if (!stateRes.ok || stateData.success === false) throw new Error(stateData.error || "Could not connect to this server's player.");
      const safePlayer = sanitizePlayerState(stateData.player);
      const shouldForceSync =
        !safePlayer?.current?.uri ||
        safePlayer.current.uri !== playbackMetaRef.current.currentUri ||
        !safePlayer?.playing ||
        safePlayer?.paused;

      if (!isMounted) return;
      setLoadError("");
      setPlayerState(safePlayer);
      setPositionState({
        positionMs: resolveIncomingPosition(safePlayer?.position, {
          force: shouldForceSync,
        }),
        syncedAt: getRealtimeNow(),
      });
      setClockTick(getRealtimeNow());
    }
    function loadPlayerState() {
      if (!isMounted) return Promise.resolve();
      if (!stateRequest) stateRequest = fetchPlayerState().catch(error => {
        if (isMounted && !controller.signal.aborted) setLoadError(error.message || "The player is reconnecting. Please try again.");
      }).finally(() => { stateRequest = null; });
      return stateRequest;
    }

    refreshPlayerStateRef.current = loadPlayerState;

    async function init() {
      try {
        if (!isMounted) return;
        await Promise.all([
          loadPlayerState(),
          fetch("/api/user/liked", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json().catch(() => ({})))
            .then((data) => {
              if (!isMounted) {
                return;
              }

              const songs = Array.isArray(data?.songs) ? data.songs : [];
              setLikedUris(new Set(songs.map((song) => song.url).filter(Boolean)));
            })
            .catch(() => {
              if (isMounted) {
                setLikedUris(new Set());
              }
            }),
        ]);
        if (!isMounted) return;

        const configRes = await fetch("/api/config", {
          cache: "no-store",
          signal: controller.signal,
        });
        const configData = await configRes.json();
        if (!isMounted) return;
        const botApi = configData.botApiUrl || "http://localhost:2000";
        const pageProtocol = typeof window !== "undefined" ? window.location.protocol : "http:";
        const botProtocol = botApi.startsWith("https://") ? "https:" : botApi.startsWith("http://") ? "http:" : pageProtocol;
        const canUseDirectSocket = !(pageProtocol === "https:" && botProtocol === "http:");

        if (canUseDirectSocket) {
          newSocket = io(botApi, {
            auth: async (callback) => {
              try {
                const response = await fetch(`/api/socket?guildId=${encodeURIComponent(guildId)}`, { cache: "no-store" });
                const data = response.ok ? await response.json() : {};
                callback({ token: data.token || "" });
              } catch { callback({ token: "" }); }
            },
          });
          newSocket.on("disconnect", (reason) => {
            if (isMounted && reason === "io server disconnect") newSocket.connect();
          });

          newSocket.on("trackStart", (data) => {
            if (data.guildId === guildId && isMounted) {
              setDragPositionMs(null);
              setIsSeeking(false);
              setPositionState({
                positionMs: resolveIncomingPosition(data?.position || 0, { force: true }),
                syncedAt: getRealtimeNow(),
              });
              setPlayerState((prev) => {
                const nextCurrent = {
                  ...mergeTrackMetadata(data.track, prev?.current),
                };
                writeCachedTrack(nextCurrent);
                return {
                  ...prev,
                  playing: true,
                  paused: false,
                  current: nextCurrent,
                };
              });
            }
          });

          newSocket.on("playerEnd", (data) => {
            if (data.guildId === guildId && isMounted) {
              setDragPositionMs(null);
              setIsSeeking(false);
              setPositionState({
                positionMs: 0,
                syncedAt: getRealtimeNow(),
              });
              setPlayerState((prev) => ({ ...prev, current: null, playing: false, paused: false }));
              setPendingAction("");
            }
          });

          newSocket.on("playerStateUpdate", (data) => {
            if (data.guildId === guildId && isMounted) {
              setPositionState((prev) => ({
                positionMs:
                  typeof data.position === "number"
                    ? resolveIncomingPosition(data.position, {
                        force: !data.playing || data.paused,
                      })
                    : prev.positionMs,
                syncedAt: getRealtimeNow(),
              }));
              setPlayerState((prev) => ({
                ...prev,
                paused: data.paused,
                volume: data.volume,
                playing: data.playing,
              }));
              setPendingAction("");
            }
          });

          newSocket.on("playerUpdate", (data) => {
            if (data.guildId === guildId && isMounted) {
              setPositionState({
                positionMs: resolveIncomingPosition(data.position),
                syncedAt: getRealtimeNow(),
              });
              setPlayerState((prev) => {
                const nextState = {
                  ...prev,
                  position: sanitizePositionMs(data.position),
                  current: prev?.current
                    ? {
                        ...prev.current,
                        length: getMergedTrackLength(data.length, prev.current.length),
                      }
                    : prev?.current,
                };

                if (nextState?.current) {
                  writeCachedTrack(nextState.current);
                }

                return nextState;
              });
            }
          });
        }

        const refreshOnFocus = () => {
          if (document.visibilityState === "visible") {
            loadPlayerState().catch((error) => {
              if (isMounted) {
                console.error("Failed to refresh player state", error);
              }
            });
          }
        };

        document.addEventListener("visibilitychange", refreshOnFocus);
        window.addEventListener("focus", refreshOnFocus);

        const refreshInterval = setInterval(() => {
          loadPlayerState().catch((error) => {
            if (isMounted) {
              console.error("Failed to poll player state", error);
            }
          });
        }, 2500);

        return () => {
          document.removeEventListener("visibilitychange", refreshOnFocus);
          window.removeEventListener("focus", refreshOnFocus);
          clearInterval(refreshInterval);
        };
      } catch (e) {
        if (isMounted && !controller.signal.aborted) {
          setLoadError(e.message || "The player could not connect. Please reload to try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    let cleanup;
    init().then((result) => {
      if (!isMounted) result?.();
      else cleanup = result;
    });

    return () => {
      isMounted = false;
      controller.abort();
      cleanup?.();
      newSocket?.disconnect();
    };
  }, [guildId]);

  const getSafeMs = (value, max = MAX_TRACK_DURATION_MS) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > max) {
      return 0;
    }

    return numericValue;
  };

  const queue = Array.isArray(playerState?.queue) ? playerState.queue : [];
  const hasCurrentTrack = Boolean(playerState?.current);
  const currentTrackUri = playerState?.current?.uri || "";
  const currentTrackLink = shareableTrackUrl(currentTrackUri);
  const confirmedVolume = Math.min(100, Math.max(1, Math.round(Number(playerState?.volume) || 1)));
  const displayedVolume = volumeDraft ?? confirmedVolume;
  const isCurrentTrackLiked = useMemo(() => {
    return Boolean(currentTrackUri && likedUris.has(currentTrackUri));
  }, [likedUris, currentTrackUri]);
  const requesterLabel =
    typeof playerState?.current?.requester === "string"
      ? playerState.current.requester
      : playerState?.current?.requester?.username || "Unknown user";
  const currentLength = getSafeMs(playerState?.current?.length);
  const basePosition = getSafeMs(positionState.positionMs);
  const elapsedSinceSync = Math.max(0, Number(clockTick) - Number(positionState.syncedAt));
  const rawLivePosition =
    playerState?.playing && !playerState?.paused
      ? basePosition + elapsedSinceSync
      : basePosition;
  const computedLivePosition = currentLength > 0 ? Math.min(rawLivePosition, currentLength) : 0;
  const livePosition = isSeeking && dragPositionMs !== null ? Math.min(dragPositionMs, currentLength || dragPositionMs) : computedLivePosition;
  const progressWidth = currentLength > 0 ? Math.min((livePosition / currentLength) * 100, 100) : 0;

  useEffect(() => {
    livePositionRef.current = livePosition;
    playbackMetaRef.current = {
      currentUri: currentTrackUri,
      playing: Boolean(playerState?.playing),
      paused: Boolean(playerState?.paused),
      seeking: Boolean(isSeeking),
    };
  }, [currentTrackUri, isSeeking, livePosition, playerState?.paused, playerState?.playing]);

  const lyricsLines = useMemo(() => {
    if (Array.isArray(lyricsState.plain) && lyricsState.plain.length > 0) {
      return lyricsState.plain.filter((line) => typeof line === "string" && line.trim()).slice(0, 240);
    }

    if (Array.isArray(lyricsState.synced) && lyricsState.synced.length > 0) {
      return lyricsState.synced
        .map((line) => line?.text)
        .filter((line) => typeof line === "string" && line.trim())
        .slice(0, 240);
    }

    return [];
  }, [lyricsState.plain, lyricsState.synced]);

  useEffect(() => {
    if (playerState?.playing && !playerState?.paused && currentLength > 0) {
      const timer = setInterval(() => setClockTick(getRealtimeNow()), 250);
      return () => clearInterval(timer);
    }
  }, [playerState?.playing, playerState?.paused, currentLength]);

  useEffect(() => {
    if (!guildId || !currentTrackUri) {
      return;
    }

    let mounted = true;
    queueMicrotask(() => {
      if (mounted) {
        setLyricsState((prev) => ({ ...prev, loading: true }));
      }
    });

    fetch(`/api/bot/lyrics/${guildId}`, { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        if (!mounted) {
          return;
        }

        setLyricsState({
          loading: false,
          available: Boolean(data?.available),
          plain: Array.isArray(data?.plain) ? data.plain : [],
          synced: Array.isArray(data?.synced) ? data.synced : [],
          source: data?.source || "",
        });
      })
      .catch(() => {
        if (mounted) {
          setLyricsState({
            loading: false,
            available: false,
            plain: [],
            synced: [],
            source: "",
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, [currentTrackUri, guildId]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = setTimeout(() => setFeedback(""), 2600);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    return () => {
      if (seekFrameRef.current) {
        cancelAnimationFrame(seekFrameRef.current);
      }
    };
  }, []);

  const handleAction = useCallback(async (action, payload = {}) => {
    if (!hasCurrentTrack || actionRequest.current) return false;
    actionRequest.current = true;
    if (action === "seek") {
      const nextPosition = sanitizePositionMs(payload?.positionMs);
      setPositionState({
        positionMs: nextPosition,
        syncedAt: getRealtimeNow(),
      });
      setDragPositionMs(nextPosition);
    }

    setPendingAction(action);

    try {
      const response = await fetch(`/api/bot/player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId, action, payload }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) {
        if (action === "previous" && data.status === "NO_PREVIOUS_TRACK") {
          setFeedback("No previously played track is available yet.");
        } else if (action === "previous" && data.status === "PREVIOUS_TRACK_NOT_FOUND") {
          setFeedback("Could not reload the previous track.");
        } else if (response.status === 429) {
          setFeedback("You are doing that too quickly. Please wait a moment.");
        } else {
          setFeedback(data.error || "Action failed.");
        }
        await refreshPlayerStateRef.current().catch(() => {});
        return false;
      }

      if (action === "seek") {
        setFeedback("Track position updated.");
      } else if (action === "setVolume") {
        setFeedback(`Volume set to ${payload.volume}%.`);
      }
      await refreshPlayerStateRef.current().catch(() => {});
      return true;
    } catch (e) {
      console.error("Action failed", e);
      setFeedback("Action failed.");
      await refreshPlayerStateRef.current().catch(() => {});
      return false;
    } finally {
      actionRequest.current = false;
      setPendingAction("");
    }
  }, [guildId, hasCurrentTrack]);

  useEffect(() => {
    if (!hasCurrentTrack) return;
    function onKeyDown(event) {
      if (ignoresPlayerShortcut(event)) return;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        void handleAction(playerState?.paused ? "resume" : "pause");
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && currentLength > 0) {
        event.preventDefault();
        const offset = event.key === "ArrowLeft" ? -10_000 : 10_000;
        void handleAction("seek", { positionMs: Math.min(currentLength, Math.max(0, livePositionRef.current + offset)) });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentLength, handleAction, hasCurrentTrack, playerState?.paused]);

  useEffect(() => {
    if (loading || !hasCurrentTrack || !stageRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setStageVisible(entry.isIntersecting), { threshold: .05 });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [hasCurrentTrack, loading]);

  const handleVolumeInput = (event) => {
    const volume = Math.min(100, Math.max(1, Math.round(Number(event.target.value) || 1)));
    volumeValueRef.current = volume;
    volumeDirtyRef.current = true;
    setVolumeDraft(volume);
  };

  const commitVolume = async () => {
    if (!volumeDirtyRef.current) return;
    volumeDirtyRef.current = false;
    await handleAction("setVolume", { volume: volumeValueRef.current });
    setVolumeDraft(null);
  };

  const copyTrackLink = async () => {
    if (!currentTrackLink) return;
    try {
      await navigator.clipboard.writeText(currentTrackLink);
      setFeedback("Song link copied. Share the music.");
    } catch {
      setFeedback("Copy is unavailable. Use Open song to copy the link from your browser.");
    }
  };

  const commitSeek = async () => {
    if (!seekDirtyRef.current) return;
    seekDirtyRef.current = false;
    if (!currentLength || !playerState?.current) {
      setIsSeeking(false);
      setDragPositionMs(null);
      return;
    }

    const nextPosition = Math.min(Math.max(0, Number(seekValueRef.current) || 0), currentLength);
    setIsSeeking(false);
    setDragPositionMs(nextPosition);
    await handleAction("seek", { positionMs: nextPosition });
  };

  const handleSeekInput = (event) => {
    seekDirtyRef.current = true;
    const nextValue = Number(event.target.value) || 0;
    seekValueRef.current = nextValue;

    if (seekFrameRef.current) {
      cancelAnimationFrame(seekFrameRef.current);
    }

    seekFrameRef.current = requestAnimationFrame(() => {
      setDragPositionMs(nextValue);
    });
  };

  const handleLike = async () => {
    if (!playerState?.current?.uri || liking) {
      return;
    }

    setLiking(true);

    try {
      const response = await fetch("/api/user/liked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: playerState.current.title,
          url: playerState.current.uri,
          author: playerState.current.author,
          thumbnail: playerState.current.thumbnail,
          duration: currentLength > 0 ? formatTime(currentLength) : "",
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(data.error || "Could not save this song.");
        return;
      }

      const nextLiked = Boolean(data?.liked);
      setLikedUris((prev) => {
        const next = new Set(prev);
        if (nextLiked) {
          next.add(playerState.current.uri);
        } else {
          next.delete(playerState.current.uri);
        }
        return next;
      });
      setFeedback(nextLiked ? "Saved to your library." : "Removed from your library.");
    } catch (error) {
      console.error(error);
      setFeedback("Could not save this song.");
    } finally {
      setLiking(false);
    }
  };

  const formatTime = (ms) => {
    const safeMs = getSafeMs(ms);
    if (!safeMs) return "0:00";
    const totalSeconds = Math.floor(safeMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    if (h > 0) {
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${h}:${minutes < 10 ? "0" : ""}${minutes}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (loading) return <div className="app-loading"><Loader2 size={24} className="mx-auto animate-spin text-primary" /><p className="text-sm">Opening the listening room…</p></div>;
  return <div className="studio-page studio-player-page player-next">
    {loadError && <div role="alert" className="studio-notice flex flex-wrap items-center justify-between gap-3"><span>{loadError}</span><button onClick={()=>window.location.reload()} className="text-xs font-semibold text-primary">Reconnect</button></div>}
    {feedback && <div role="status" className="studio-notice">{feedback}</div>}
    <div className="studio-toolbar studio-player-toolbar mb-2"><div><p className="studio-eyebrow">The listening room</p><h1 className="studio-title mt-2">Now playing</h1></div><div className="flex gap-2"><Link href={"/dashboard/"+guildId+"/search"} className="studio-button-quiet"><Search size={16} />Discover</Link><Link href={"/dashboard/"+guildId+"/queue"} className="studio-button-quiet"><ListMusic size={16} />Queue</Link></div></div>
    {!playerState?.current ? <section className="studio-welcome !min-h-[420px]">
      <div className="studio-welcome-copy"><p className="studio-eyebrow">Ready when you are</p><h2 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-[-.06em] sm:text-6xl">Your room<br />is <span className="text-primary">quiet.</span></h2><p className="studio-description">Find a song you love and bring everyone along.</p><Link href={"/dashboard/"+guildId+"/search"} className="studio-button mt-7"><Search size={16} />Find your first song</Link></div>
      <StudioArtwork src="/art/headphones-studio.webp" className="studio-welcome-art" />
    </section> : <>
      <section className="studio-player" data-playing={Boolean(playerState.playing && !playerState.paused)}>
        <div ref={stageRef} className="player-stage" data-visible={stageVisible}>
          <div aria-hidden="true" className="player-stage-halo" />
          <div className="studio-record"><img src={playerState.current.thumbnail || "/branding/kreo-girl-v2.webp"} alt={playerState.current.title || "Track cover"} /></div>
          <div aria-hidden="true" className="player-stage-floor" />
        </div>
        <div className="studio-player-details min-w-0 py-2">
          <p className="studio-eyebrow studio-player-microheading">{playerState.paused ? "Taking a breath" : "In the moment"}</p>
          <h2 className="studio-player-title mt-5" title={playerState.current.title}>{playerState.current.title}</h2>
          <p className="studio-player-artist mt-4 text-base text-[#ada4bb]">{playerState.current.author}</p>
          <p className="studio-player-requester mt-2 text-xs text-[#756b83]">Selected by {requesterLabel}</p>
          <div className="studio-player-progress mt-8">
            <div className="relative rounded-full focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-primary">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10"><div className={"h-full rounded-full bg-primary " + (isSeeking ? "" : "transition-[width] duration-200 ease-linear")} style={{width:progressWidth+"%"}} /></div>
              <input type="range" aria-label="Track position" aria-valuetext={formatTime(livePosition)+" of "+formatTime(currentLength)} min={0} max={Math.max(currentLength,0)} step={50} value={Math.min(livePosition,currentLength||livePosition)}
                onMouseDown={()=>setIsSeeking(true)} onTouchStart={()=>setIsSeeking(true)} onChange={handleSeekInput} onInput={handleSeekInput}
                onMouseUp={commitSeek} onTouchEnd={commitSeek} onBlur={commitSeek}
                onKeyUp={event=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key))commitSeek();}}
                disabled={Boolean(pendingAction)||!currentLength} className="studio-player-seek absolute -top-2 h-5 w-full cursor-pointer opacity-0" />
            </div>
            <div className="mt-3 flex justify-between text-[11px] tabular-nums text-[#81768f]"><span>{formatTime(livePosition)}</span><span>{formatTime(currentLength)}</span></div>
          </div>
          <div className="studio-player-controls mt-6 flex items-center gap-4">
            <button onClick={()=>handleAction("previous")} aria-label="Previous track" disabled={Boolean(pendingAction)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#b2a6c2] transition hover:bg-white/5 hover:text-white">{pendingAction==="previous"?<Loader2 size={18} className="animate-spin" />:<SkipForward size={20} className="rotate-180" fill="currentColor" />}</button>
            <button onClick={()=>handleAction(playerState.paused?"resume":"pause")} aria-label={playerState.paused?"Resume playback":"Pause playback"} disabled={Boolean(pendingAction)} className="studio-player-toggle grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary text-[#1b112b] transition hover:scale-105 hover:bg-[#d5beff]">{pendingAction==="pause"||pendingAction==="resume"?<Loader2 size={25} className="animate-spin" />:playerState.paused?<Play size={26} fill="currentColor" className="ml-1" />:<Pause size={26} fill="currentColor" />}</button>
            <button onClick={()=>handleAction("skip")} aria-label="Skip track" disabled={Boolean(pendingAction)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#b2a6c2] transition hover:bg-white/5 hover:text-white">{pendingAction==="skip"?<Loader2 size={18} className="animate-spin" />:<SkipForward size={20} fill="currentColor" />}</button>
            <button onClick={handleLike} aria-label={isCurrentTrackLiked?"Remove from liked songs":"Save to liked songs"} disabled={liking||Boolean(pendingAction)} className={"studio-player-save ml-auto flex min-h-11 items-center gap-2 text-xs " + (isCurrentTrackLiked?"text-primary":"text-[#92859f] hover:text-primary")}>{liking?<Loader2 size={18} className="animate-spin" />:<Heart size={18} fill={isCurrentTrackLiked?"currentColor":"none"} />}<span className="hidden sm:inline">{isCurrentTrackLiked?"Saved":"Save"}</span></button>
          </div>
          <div className="player-tools">
            <label className="player-volume">
              <span className="sr-only">Volume</span>
              {pendingAction === "setVolume" ? <Loader2 size={18} className="shrink-0 animate-spin text-primary" /> : displayedVolume < 40 ? <Volume1 size={19} aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}
              <input type="range" aria-label="Volume" aria-valuetext={`${displayedVolume}%${volumeDraft !== null ? ", release to apply" : ""}`} min={1} max={100} step={1} value={displayedVolume}
                onChange={handleVolumeInput} onPointerUp={commitVolume} onBlur={commitVolume}
                onKeyUp={event=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key))void commitVolume();}}
                onPointerCancel={()=>{volumeDirtyRef.current=false;setVolumeDraft(null);}}
                disabled={Boolean(pendingAction)} />
              <span className="player-volume-value" aria-hidden="true">{displayedVolume}%</span>
            </label>
            <div className="player-share-actions">
              <button onClick={copyTrackLink} disabled={!currentTrackLink} aria-label="Copy song link" title="Copy song link"><Copy size={17} /></button>
              {currentTrackLink && <a href={currentTrackLink} target="_blank" rel="noopener noreferrer" aria-label="Open song" title="Open song"><ExternalLink size={17} /></a>}
            </div>
          </div>
        </div>
      </section>
      <p className="player-shortcuts"><Keyboard size={14} aria-hidden="true" /><span><kbd>Space</kbd> play / pause</span><span><kbd>←</kbd><kbd>→</kbd> seek 10 sec</span></p>
      <div className="studio-bottom-grid">
        <section className="studio-queue-section min-w-0" data-empty={queue.length === 0}>
          <div className="studio-queue-heading mb-5 flex items-center justify-between"><div><p className="studio-eyebrow studio-player-microheading">Keep it going</p><h3 className="mt-2 text-xl font-semibold tracking-tight">Up next <span className="ml-2 text-xs font-normal text-[#81728f]">{queue.length} tracks</span></h3></div><Link href={"/dashboard/"+guildId+"/queue"} className="text-xs text-primary hover:text-white">View queue</Link></div>
          {queue.length ? <ol>{queue.slice(0,5).map((track,index)=><li key={(track.uri||track.title)+"-"+index} className="flex items-center gap-3 border-b border-white/5 py-3"><span className="w-4 shrink-0 text-[11px] tabular-nums text-[#6d617b]">{index+1}</span><img src={track.thumbnail||"/branding/kreo-girl-v2.webp"} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" loading="lazy" /><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-medium">{track.title}</h4><p className="mt-1 truncate text-xs text-[#91819f]">{track.author}</p></div><span className="text-[11px] tabular-nums text-[#81728f]">{formatTime(track.length)}</span></li>)}</ol>:<div className="studio-empty-queue py-8 text-sm text-[#91819f]"><p>Your queue is clear.</p><Link href={"/dashboard/"+guildId+"/search"} className="mt-3 inline-flex min-h-11 items-center text-primary">Find a song</Link></div>}
        </section>
        <section className="studio-lyrics-section min-w-0" data-empty={!lyricsState.loading && (!lyricsState.available || lyricsLines.length === 0)}>
          <div className="mb-5 flex items-end justify-between"><div><p className="studio-eyebrow studio-player-microheading">Know every word</p><h3 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight"><Captions size={19} className="text-primary" />Lyrics</h3></div>{lyricsState.source&&<span className="text-[10px] text-[#766685]">{lyricsState.source}</span>}</div>
          {lyricsState.loading?<p className="flex items-center gap-2 py-5 text-sm text-[#9e8eab]"><Loader2 size={15} className="animate-spin" />Finding the words…</p>:lyricsState.available&&lyricsLines.length?<div className="max-h-72 space-y-4 overflow-y-auto py-2 pr-4">{lyricsLines.map((line,index)=><p key={index} className="text-base leading-7 text-[#b9aac7]">{line}</p>)}</div>:<p className="py-6 text-sm leading-7 text-[#81728f]">The words aren&apos;t available for this one. Enjoy the music.</p>}
        </section>
      </div>
    </>}
  </div>;
}


