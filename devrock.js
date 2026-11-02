const config = require("./src/config");
const { ClusterManager } = require("discord-hybrid-sharding");
const Logger = require("./src/utils/logger");
const path = require("path");

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { KazagumoTrack } = require("kazagumo");
const { verifySocketToken } = require("./src/utils/dashboardSocketAuth");
const { validateBridgeRequest } = require("./src/utils/bridgePolicy");

const ACTION_LOGGER_PATH = path.join(__dirname, "src", "utils", "actionLogger.js");
const AUTO_RECONNECT_SCHEMA_PATH = path.join(__dirname, "src", "schema", "247.js");
const LYRICS_MANAGER_PATH = path.join(__dirname, "src", "utils", "lyricsManager.js");
const BRIDGE_ACCESS_PATH = path.join(__dirname, "src", "utils", "bridgeAccess.js");
const DASHBOARD_PLAYBACK_PATH = path.join(__dirname, "src", "utils", "dashboardPlayback.js");
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || process.env.PORT || 2000);
const BRIDGE_SECRET = config.dashboard?.bridgeSecret;
const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function getOrigin(value) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

function buildAllowedOrigins() {
  const origins = new Set(
    String(process.env.DASHBOARD_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => getOrigin(origin.trim()))
      .filter(Boolean)
  );

  const dashboardOrigin = getOrigin(config.dashboard?.nextAuthUrl);
  if (dashboardOrigin) {
    origins.add(dashboardOrigin);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

function isOriginAllowed(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function isBridgeAuthorized(req) {
  return req.get("x-kreo-bridge-secret") === BRIDGE_SECRET;
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isOriginAllowed(origin));
  },
  methods: ["GET", "POST"],
};

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

function getRequesterName(track) {
  if (!track) {
    return "Unknown";
  }

  const candidates = [
    typeof track.requester === "string" ? track.requester : undefined,
    track.requester?.username,
    track.requester?.globalName,
    track.requester?.displayName,
    track.requester?.tag,
    typeof track.userData === "string" ? track.userData : undefined,
    track.userData?.username,
    track.userData?.globalName,
    track.userData?.displayName,
    track.userData?.tag,
    typeof track.requesterName === "string" ? track.requesterName : undefined,
    typeof track.requestedBy === "string" ? track.requestedBy : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Unknown";
}

function normalizeTrackTitle(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function buildTrackRepairQuery(track) {
  if (!track || typeof track !== "object") {
    return "";
  }

  const normalizedAuthor =
    typeof track.author === "string"
      ? track.author.replace(/\s*-\s*Topic\s*$/i, "").trim()
      : "";

  return [track.title, normalizedAuthor]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .trim();
}

function serializeTrack(track) {
  if (!track) {
    return null;
  }

  return {
    title: track.title,
    author: track.author,
    uri: track.uri,
    identifier: track.identifier || null,
    length: getTrackLengthMs(track),
    thumbnail: track.thumbnail || track.artworkUrl,
    requester: getRequesterName(track),
  };
}

function serializeSearchTrack(track) {
  if (!track) {
    return null;
  }

  return {
    track: track.track || null,
    sourceName: track.sourceName || null,
    title: track.title || null,
    uri: track.uri || null,
    identifier: track.identifier || null,
    isSeekable: Boolean(track.isSeekable),
    isStream: Boolean(track.isStream),
    author: track.author || null,
    length: getTrackLengthMs(track),
    thumbnail: track.thumbnail || track.artworkUrl || null,
    requester: getRequesterName(track),
  };
}

const manager = new ClusterManager("./index.js", {
  totalShards: "auto",
  shardsPerCluster: 1,
  mode: "process",
  token: config.token,
  respawn: true,
  restarts: {
    max: 5,
    interval: 1000,
  },
});

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use("/api", (req, res, next) => {
    if (req.method === "GET" && req.path === "/health") {
        return next();
    }

    if (!BRIDGE_SECRET) {
        return res.status(503).json({ error: "Bot bridge secret is not configured" });
    }

    if (!isBridgeAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method === "POST") {
        const error = validateBridgeRequest(req.path, req.body);
        if (error) return res.status(400).json({ success: false, error });
    }
    return next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [...ALLOWED_ORIGINS],
    methods: ["GET", "POST"]
  },
  allowRequest: (req, callback) => {
    callback(null, isOriginAllowed(req.headers.origin));
  },
});
io.use((socket, next) => {
  const authorization = verifySocketToken(socket.handshake.auth?.token, BRIDGE_SECRET);
  if (!authorization) return next(new Error("Unauthorized"));
  socket.data.authorization = authorization;
  next();
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/lyrics/:id", async (req, res) => {
    const guildId = req.params.id;

    try {
        const results = await manager.broadcastEval(async (c, { gId, lyricsManagerPath }) => {
            if (!c.manager || !c.guilds.cache.has(gId)) return null;

            const player = c.manager.players.get(gId);
            const current = player?.queue?.current;
            if (!current) {
                return { available: false, reason: "NO_TRACK" };
            }

            const cacheKey = `lyrics:v2:${current.uri || current.identifier || current.title}`;
            const cachedLyrics = player.data?.get(cacheKey);
            if (cachedLyrics?.expiresAt && cachedLyrics.expiresAt > Date.now()) {
                return cachedLyrics.payload;
            }

            const { LyricsManager, parseSyncedLyrics } = require(lyricsManagerPath);
            const lyricsManager = new LyricsManager();
            const resolveTrackLength = (track) => {
                const candidates = [
                    track?.length,
                    track?.duration,
                    track?.info?.length,
                    track?.raw?.info?.length,
                ];

                for (const candidate of candidates) {
                    const numericValue = Number(candidate);
                    if (Number.isFinite(numericValue) && numericValue > 0) {
                        return numericValue;
                    }
                }

                return 0;
            };
            const normalizeSyncedLyrics = (lines, referenceDurationMs, actualDurationMs) => {
                if (!Array.isArray(lines) || lines.length === 0) {
                    return [];
                }

                const safeReferenceDuration = Number(referenceDurationMs) || 0;
                const safeActualDuration = Number(actualDurationMs) || 0;

                if (!safeReferenceDuration || !safeActualDuration) {
                    return lines;
                }

                const ratio = safeActualDuration / safeReferenceDuration;
                const durationGap = Math.abs(safeActualDuration - safeReferenceDuration);

                if (!Number.isFinite(ratio) || ratio < 0.85 || ratio > 1.15 || durationGap < 1200) {
                    return lines;
                }

                return lines.map((line) => ({
                    ...line,
                    time: Math.max(0, Math.round(Number(line.time || 0) * ratio)),
                }));
            };
            const currentTrackLength = resolveTrackLength(current);
            const result = await lyricsManager.fetchLyrics(
                current.title,
                current.author,
                currentTrackLength
            );

            if (!result?.lyrics) {
                const payload = {
                    available: false,
                    title: current.title || "Unknown title",
                    author: current.author || "Unknown artist",
                    source: null,
                    synced: [],
                    plain: [],
                };
                player.data?.set(cacheKey, {
                    expiresAt: Date.now() + 5 * 60_000,
                    payload,
                });
                return payload;
            }

            const synced = normalizeSyncedLyrics(
                parseSyncedLyrics(result.synced),
                result.referenceDurationMs,
                currentTrackLength
            );
            const plain = String(result.lyrics)
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 240);

            const payload = {
                available: true,
                title: current.title || "Unknown title",
                author: current.author || "Unknown artist",
                source: result.source || "Unknown source",
                synced,
                plain,
            };

            player.data?.set(cacheKey, {
                expiresAt: Date.now() + 30 * 60_000,
                payload,
            });
            return payload;
        }, { context: { gId: guildId, lyricsManagerPath: LYRICS_MANAGER_PATH } });

        const lyrics = results.find((item) => item !== null) || { available: false, reason: "NO_TRACK" };
        res.json(lyrics);
    } catch (e) {
        res.status(500).json({ available: false, error: e.message });
    }
});

app.get("/api/guild/:id", async (req, res) => {
    const guildId = req.params.id;
    try {
        const results = await manager.broadcastEval(async (c, { gId }) => {
            if (!c.manager) return null;
            const player = c.manager.players.get(gId);
            if (!player) return null;
            const lastTrackMeta = player.data?.get("lastTrackMeta") || null;

            const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;
            const sanitizeTrackLengthMs = (value) => {
                const numericValue = Number(value);
                if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_TRACK_DURATION_MS) {
                    return 0;
                }

                return numericValue;
            };

            const getTrackLengthMs = (track) => {
                if (!track || typeof track !== "object") {
                    return 0;
                }

                const rawTrack = typeof track.getRaw === "function" ? track.getRaw() : null;
                const candidates = [
                    track.length,
                    track.duration,
                    track.info?.length,
                    track.raw?.info?.length,
                    rawTrack?.info?.length,
                ];

                for (const candidate of candidates) {
                    const safeLength = sanitizeTrackLengthMs(candidate);
                    if (safeLength > 0) {
                        return safeLength;
                    }
                }

                return 0;
            };

            const getEncodedTrack = (track) => {
                if (!track || typeof track !== "object") {
                    return player.shoukaku?.track || null;
                }

                return track.track || track.encoded || player.shoukaku?.track || null;
            };

            const normalizeTrackTitle = (value) =>
                typeof value === "string"
                    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
                    : "";

            const buildTrackRepairQuery = (track) => {
                if (!track || typeof track !== "object") {
                    return "";
                }

                const normalizedAuthor =
                    typeof track.author === "string"
                        ? track.author.replace(/\s*-\s*Topic\s*$/i, "").trim()
                        : "";

                return [track.title, normalizedAuthor]
                    .filter((value) => typeof value === "string" && value.trim())
                    .join(" ")
                    .trim();
            };

            const repairTrackLengthMs = async (track, fallbackTrack = null) => {
                const repairTrack = track || fallbackTrack;
                const repairQuery = buildTrackRepairQuery(repairTrack);
                if (!repairQuery) {
                    return 0;
                }

                try {
                    const repairResult = await c.manager.search(repairQuery, { engine: "ytsearch" });
                    if (!repairResult?.tracks?.length) {
                        return 0;
                    }

                    const targetTitle = normalizeTrackTitle(repairTrack?.title || fallbackTrack?.title);
                    const repairedTrack =
                        repairResult.tracks.find((candidate) => {
                            const candidateLength = getTrackLengthMs(candidate);
                            if (!candidateLength) {
                                return false;
                            }

                            if (!targetTitle) {
                                return true;
                            }

                            return normalizeTrackTitle(candidate.title) === targetTitle;
                        }) ||
                        repairResult.tracks.find((candidate) => getTrackLengthMs(candidate) > 0) ||
                        null;

                    return repairedTrack ? getTrackLengthMs(repairedTrack) : 0;
                } catch {
                    return 0;
                }
            };

            const resolveTrackLengthMs = async (track, fallbackTrack = null) => {
                const directLength = getTrackLengthMs(track) || getTrackLengthMs(fallbackTrack);
                if (directLength > 0) {
                    return directLength;
                }

                const encodedTrack = getEncodedTrack(track || fallbackTrack);
                if (!encodedTrack || !player.shoukaku?.node?.rest?.decode) {
                    return 0;
                }

                try {
                    const decodedTrack = await player.shoukaku.node.rest.decode(encodedTrack);
                    const decodedLength = sanitizeTrackLengthMs(decodedTrack?.info?.length);
                    if (decodedLength > 0) {
                        return decodedLength;
                    }
                } catch {}

                return repairTrackLengthMs(track, fallbackTrack);
            };

            const getRequesterName = (track) => {
                if (!track) {
                    return "Unknown";
                }

                const candidates = [
                    typeof track.requester === "string" ? track.requester : undefined,
                    track.requester?.username,
                    track.requester?.globalName,
                    track.requester?.displayName,
                    track.requester?.tag,
                    typeof track.userData === "string" ? track.userData : undefined,
                    track.userData?.username,
                    track.userData?.globalName,
                    track.userData?.displayName,
                    track.userData?.tag,
                    typeof track.requesterName === "string" ? track.requesterName : undefined,
                    typeof track.requestedBy === "string" ? track.requestedBy : undefined,
                ];

                for (const candidate of candidates) {
                    if (typeof candidate === "string" && candidate.trim()) {
                        return candidate.trim();
                    }
                }

                return "Unknown";
            };

            const isSameTrack = (track, fallbackTrack) => {
                if (!track || !fallbackTrack) {
                    return false;
                }

                if (track.identifier && fallbackTrack.identifier && track.identifier === fallbackTrack.identifier) {
                    return true;
                }

                if (track.uri && fallbackTrack.uri && track.uri === fallbackTrack.uri) {
                    return true;
                }

                return !!(track.title && fallbackTrack.title && track.title === fallbackTrack.title);
            };

            const serializeTrack = async (track) => {
                if (!track) {
                    return null;
                }

                const fallbackTrack = isSameTrack(track, lastTrackMeta) ? lastTrackMeta : null;
                const resolvedLength = await resolveTrackLengthMs(track, fallbackTrack);

                return {
                    title: track.title || fallbackTrack?.title || null,
                    author: track.author || fallbackTrack?.author || null,
                    uri: track.uri || fallbackTrack?.uri || null,
                    identifier: track.identifier || fallbackTrack?.identifier || null,
                    length: resolvedLength,
                    thumbnail: track.thumbnail || track.artworkUrl || fallbackTrack?.thumbnail || null,
                    requester: (() => {
                        const primaryRequester = getRequesterName(track);
                        if (primaryRequester !== "Unknown") {
                            return primaryRequester;
                        }

                        return getRequesterName(fallbackTrack);
                    })()
                };
            };

            return {
                playing: player.playing,
                paused: player.paused,
                volume: player.volume,
                position: player.position,
                capturedAt: Date.now(),
                current: await serializeTrack(player.queue.current),
                queue: (await Promise.all(Array.from(player.queue).map((track) => serializeTrack(track)))).filter(Boolean)
            };
        }, { context: { gId: guildId } });

        const playerState = results.find(r => r !== null);
        if (!playerState) {
            return res.json({ player: null });
        }

        res.json({
            player: {
                ...playerState,
                position: sanitizePositionMs(playerState.position),
                capturedAt: Number(playerState.capturedAt) || Date.now(),
                current: playerState.current ? serializeTrack(playerState.current) : null,
                queue: Array.isArray(playerState.queue)
                    ? playerState.queue.map((track) => serializeTrack(track)).filter(Boolean)
                    : [],
            }
        });
    } catch (e) {
        res.json({ player: null, error: e.message });
    }
});

app.get("/api/guild/:id/channels", async (req, res) => {
    try {
        const guildId = req.params.id;
        const results = await manager.broadcastEval((c, gId) => {
            const guild = c.guilds.cache.get(gId);
            if (!guild) return null;
            
            const voiceChannels = guild.channels.cache
                .filter(ch => ch.isVoiceBased())
                .map(ch => ({ id: ch.id, name: ch.name }));
                
            const textChannels = guild.channels.cache
                .filter(ch => ch.isTextBased())
                .map(ch => ({ id: ch.id, name: ch.name }));
                
            return { voiceChannels, textChannels };
        }, { context: guildId });

        const validResult = results.find(r => r !== null);
        if (validResult) res.json(validResult);
        else res.status(404).json({ error: "Guild not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/bot-guilds", async (req, res) => {
    const { guildIds } = req.body;
    if (!guildIds || !Array.isArray(guildIds)) return res.json([]);
    try {
        const results = await manager.broadcastEval((c, gIds) => {
            return gIds.filter(id => c.guilds.cache.has(id));
        }, { context: guildIds });
        
        // Flatten array of arrays and remove duplicates just in case
        const botGuilds = [...new Set(results.flat())];
        res.json(botGuilds);
    } catch(e) {
        res.json([]);
    }
});

app.get("/api/leaderboard", async (req, res) => {
    try {
        const results = await manager.broadcastEval(async (c) => {
            if (!c.manager) return [];

            const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;
            const sanitizePositionMs = (value) => {
                const numericValue = Number(value);
                if (!Number.isFinite(numericValue) || numericValue < 0) {
                    return 0;
                }

                return Math.min(numericValue, MAX_TRACK_DURATION_MS);
            };

            const sanitizeTrackLengthMs = (value) => {
                const numericValue = Number(value);
                if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_TRACK_DURATION_MS) {
                    return 0;
                }

                return numericValue;
            };

            const getTrackLengthMs = (track) => {
                if (!track || typeof track !== "object") {
                    return 0;
                }

                const rawTrack = typeof track.getRaw === "function" ? track.getRaw() : null;
                const candidates = [
                    track.length,
                    track.duration,
                    track.info?.length,
                    track.raw?.info?.length,
                    rawTrack?.info?.length,
                ];

                for (const candidate of candidates) {
                    const safeLength = sanitizeTrackLengthMs(candidate);
                    if (safeLength > 0) {
                        return safeLength;
                    }
                }

                return 0;
            };

            const getRequesterName = (track) => {
                if (!track) {
                    return "Unknown";
                }

                const candidates = [
                    typeof track.requester === "string" ? track.requester : undefined,
                    track.requester?.username,
                    track.requester?.globalName,
                    track.requester?.displayName,
                    track.requester?.tag,
                    typeof track.userData === "string" ? track.userData : undefined,
                    track.userData?.username,
                    track.userData?.globalName,
                    track.userData?.displayName,
                    track.userData?.tag,
                    typeof track.requesterName === "string" ? track.requesterName : undefined,
                    typeof track.requestedBy === "string" ? track.requestedBy : undefined,
                ];

                for (const candidate of candidates) {
                    if (typeof candidate === "string" && candidate.trim()) {
                        return candidate.trim();
                    }
                }

                return "Unknown";
            };

            const players = [...c.manager.players.values()].filter((player) => player?.queue?.current);

            return players.map((player) => {
                const guild = c.guilds.cache.get(player.guildId);
                const current = player.queue.current;
                const history = player.data?.get("history") || [];
                const voiceChannel = guild?.channels?.cache?.get(player.voiceId) || null;
                const queueCount = Array.from(player.queue || []).length;
                const sessionPlays = history.length + (current ? 1 : 0) + queueCount;

                return {
                    guildId: player.guildId,
                    guildName: guild?.name || "Unknown server",
                    guildIcon: guild?.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                    voiceChannel: voiceChannel?.name || "Voice Channel",
                    listeners: voiceChannel?.members?.size || 0,
                    playing: Boolean(player.playing),
                    paused: Boolean(player.paused),
                    volume: Number(player.volume) || 0,
                    position: sanitizePositionMs(player.position),
                    queueCount,
                    sessionPlays,
                    clusterId: c.cluster?.id ?? null,
                    current: {
                        title: current?.title || "Unknown title",
                        author: current?.author || "Unknown artist",
                        uri: current?.uri || null,
                        identifier: current?.identifier || null,
                        thumbnail: current?.thumbnail || current?.artworkUrl || null,
                        requester: getRequesterName(current),
                        length: getTrackLengthMs(current),
                    },
                };
            });
        });

        const entries = results
            .flat()
            .filter((entry) => entry?.current?.title)
            .sort((left, right) => {
                if ((right.listeners || 0) !== (left.listeners || 0)) {
                    return (right.listeners || 0) - (left.listeners || 0);
                }

                if ((right.sessionPlays || 0) !== (left.sessionPlays || 0)) {
                    return (right.sessionPlays || 0) - (left.sessionPlays || 0);
                }

                return (left.guildName || "").localeCompare(right.guildName || "");
            });

        res.json({
            updatedAt: Date.now(),
            totalActiveServers: entries.length,
            entries,
        });
    } catch (e) {
        res.status(500).json({ error: e.message, entries: [] });
    }
});

app.post("/api/player", async (req, res) => {
    const { guildId, action, payload, userId, source } = req.body;
    try {
        const results = await manager.broadcastEval(async (c, { gId, act, pl, uId, src, loggerPath, accessPath }) => {
            if (!c.manager) return false;
            const guild = c.guilds.cache.get(gId);
            if (!guild) return false;
            const player = c.manager.players.get(gId);
            if (!player) return "NO_PLAYER";
            const sendActionLog = require(loggerPath);
            const access = await require(accessPath).getPlaybackMember(c, gId, uId, player);
            if (access.status !== "OK") return access.status;
            const actor = access.member.user;
            let logAction = null;
            let logTrack = player.queue.current || null;

            if (act === "pause" || act === "resume") {
                if (!player.queue.current) return "NO_TRACK";
                const paused = act === "pause";
                await player.shoukaku.setPaused(paused);
                player.paused = paused;
                player.playing = !paused;
            }
            else if (act === "skip") {
                logTrack = player.queue.current || null;
                await player.skip();
            }
            else if (act === "previous") {
                const history = player.data?.get("history") || [];
                if (history.length === 0) {
                    return "NO_PREVIOUS_TRACK";
                }

                const previousTrackData = history[history.length - 1];
                const requester = player.queue.current?.requester || c.user;
                const searchResult = await player.search(previousTrackData.uri || previousTrackData.title, {
                    requester,
                });

                if (!searchResult?.tracks?.length) {
                    return "PREVIOUS_TRACK_NOT_FOUND";
                }

                const previousTrack = searchResult.tracks[0];
                previousTrack.requestSource = src || "dashboard";
                history.pop();
                player.data?.set("history", history);

                if (player.queue.current) {
                    player.queue.unshift(player.queue.current);
                }

                player.queue.unshift(previousTrack);
                player.data?.set("autoplayAdded", false);
                await player.skip();
                logTrack = previousTrack;
            }
            else if (act === "setVolume") await player.setVolume(pl.volume);
            else if (act === "seek") {
                const seekTo = Math.max(0, Number(pl?.positionMs) || 0);
                if (typeof player.seek === "function") {
                    await player.seek(seekTo);
                }
            }
            else if (act === "removeTrack") {
                if (pl.index !== undefined && player.queue[pl.index]) {
                    logTrack = player.queue[pl.index];
                    player.queue.splice(pl.index, 1);
                }
            } else if (act === "clearQueue") {
                player.queue.clear();
            }

            if (act === "pause") logAction = "Paused music";
            if (act === "resume") logAction = "Resumed music";
            if (act === "skip") logAction = "Skipped music";
            if (act === "previous") logAction = "Played previous track";
            if (act === "setVolume") logAction = `Changed volume to ${pl.volume}%`;
            if (act === "seek") logAction = "Seeked track position";
            if (act === "removeTrack") logAction = "Removed song from queue";
            if (act === "clearQueue") logAction = "Cleared music queue";

            if (guild && logAction) {
                await sendActionLog(c, guild, actor, logAction, logTrack, {
                    source: src || "dashboard",
                });
            }
            
            if (c.cluster) {
                c.cluster.send({
                    type: "DASHBOARD_EVENT",
                    event: "playerStateUpdate",
                    data: {
                        guildId: gId,
                        paused: player.paused,
                        volume: player.volume,
                        playing: player.playing
                    }
                }).catch(()=>{});
            }
            
            return true;
        }, { context: { gId: guildId, act: action, pl: payload, uId: userId, src: source, loggerPath: ACTION_LOGGER_PATH, accessPath: BRIDGE_ACCESS_PATH } });

        const firstMeaningfulResult = results.find((r) => r && r !== false);
        const success = results.some((r) => r === true);
        res.status(success ? 200 : firstMeaningfulResult === "NO_PLAYER" ? 404 : 403).json({ success, status: firstMeaningfulResult === true ? "OK" : firstMeaningfulResult || null });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post("/api/search", async (req, res) => {
    const { query } = req.body;
    const safeQuery = typeof query === "string" ? query.trim() : "";
    if (!safeQuery) {
        return res.status(400).json({ results: { tracks: [] }, error: "Search query is required" });
    }

    try {
        const results = await manager.broadcastEval(async (c, { q }) => {
            if (!c.manager) return null;
            try {
                const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;
                const sanitizeTrackLengthMs = (value) => {
                    const numericValue = Number(value);
                    if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_TRACK_DURATION_MS) {
                        return 0;
                    }

                    return numericValue;
                };

                const getTrackLengthMs = (track) => {
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
                };

                const normalizeTrackTitle = (value) =>
                    typeof value === "string"
                        ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
                        : "";

                const buildTrackRepairQuery = (track) => {
                    if (!track || typeof track !== "object") {
                        return "";
                    }

                    const normalizedAuthor =
                        typeof track.author === "string"
                            ? track.author.replace(/\s*-\s*Topic\s*$/i, "").trim()
                            : "";

                    return [track.title, normalizedAuthor]
                        .filter((value) => typeof value === "string" && value.trim())
                        .join(" ")
                        .trim();
                };

                const repairTrackLength = async (track) => {
                    const repairQuery = buildTrackRepairQuery(track);
                    if (!repairQuery) {
                        return;
                    }

                    try {
                        const repairResult = await c.manager.search(repairQuery, { engine: "ytsearch" });
                        if (!repairResult?.tracks?.length) {
                            return;
                        }

                        const targetTitle = normalizeTrackTitle(track?.title);
                        const repairedTrack =
                            repairResult.tracks.find((candidate) => {
                                const candidateLength = getTrackLengthMs(candidate);
                                if (!candidateLength) {
                                    return false;
                                }

                                if (!targetTitle) {
                                    return true;
                                }

                                return normalizeTrackTitle(candidate.title) === targetTitle;
                            }) ||
                            repairResult.tracks.find((candidate) => getTrackLengthMs(candidate) > 0) ||
                            null;

                        if (repairedTrack) {
                            const repairedLength = getTrackLengthMs(repairedTrack);
                            if (repairedLength > 0) {
                                track.length = repairedLength;
                            }
                        }
                    } catch {}
                };

                const isDirectUrl = /^https?:\/\//.test(q);
                const res = await c.manager.search(q, isDirectUrl ? {} : { engine: c.config?.node_source || c.manager.defaultSearchEngine || "ytmsearch" });
                if (res?.tracks?.length) {
                    await Promise.all(
                        res.tracks.map(async (track) => {
                            if (!getTrackLengthMs(track)) {
                                await repairTrackLength(track);
                            }
                        })
                    );
                }
                return res;
            } catch (e) { return null; }
        }, { context: { q: safeQuery } });
        
        const validResult = results.find(r => r && r.tracks && r.tracks.length > 0);
        if (!validResult) {
            return res.json({ results: { tracks: [] } });
        }

        res.json({
            results: {
                ...validResult,
                tracks: Array.isArray(validResult.tracks)
                    ? validResult.tracks.map((track) => serializeSearchTrack(track)).filter(Boolean)
                    : [],
            }
        });
    } catch (e) {
        res.json({ results: { tracks: [] }, error: e.message });
    }
});

app.post("/api/play", async (req, res) => {
    const { guildId, userId, track, source } = req.body;
    try {
        const results = await manager.broadcastEval(async (c, { gId, uId, trk, src, loggerPath, accessPath, playbackPath }) => {
            if (!c.manager) return false;
            const guild = c.guilds.cache.get(gId);
            if (!guild) return false;
            const access = await require(accessPath).getPlaybackMember(c, gId, uId, c.manager.players.get(gId));
            if (access.status !== "OK") return access.status;
            const member = access.member;
            const { resolveDashboardTrack, refreshIdleDashboardVoice } = require(playbackPath);
            let player = c.manager.players.get(gId);
            if (!player) {
                player = await c.manager.createPlayer({ guildId: gId, voiceId: member.voice.channel.id, textId: member.voice.channel.id, deaf: true });
            } else if (player.voiceId !== member.voice.channel.id) {
                return "DIFFERENT_VOICE_CHANNEL";
            }
            const queuedTrack = await resolveDashboardTrack(c, player, trk, member.user);
            if (!player.playing && !player.paused) await refreshIdleDashboardVoice(player, member.voice.channel.id);
            queuedTrack.requestSource = src || "dashboard";
            player.queue.add(queuedTrack);
            if (!player.playing && !player.paused) {
                await player.play();
                if (!player.queue.current) throw new Error("The audio server could not start this track. Try another result.");
            } else {
                await require(loggerPath)(c, guild, member.user, "Added track to queue", queuedTrack, { source: src || "dashboard" });
            }
            return true;
        }, { context: { gId: guildId, uId: userId, trk: track, src: source, loggerPath: ACTION_LOGGER_PATH, accessPath: BRIDGE_ACCESS_PATH, playbackPath: DASHBOARD_PLAYBACK_PATH } });
        const status = results.find(result => result !== false);
        res.json({ success: status === true, status });
    } catch (error) {
        res.status(502).json({ success: false, error: error.message });
    }
});

app.post("/api/play-batch", async (req, res) => {
    const { guildId, userId, tracks, source, clearQueue } = req.body;
    try {
        const results = await manager.broadcastEval(async (c, { gId, uId, trks, src, shouldClear, loggerPath, accessPath, playbackPath }) => {
            if (!c.manager) return false;
            const guild = c.guilds.cache.get(gId);
            if (!guild) return false;
            const access = await require(accessPath).getPlaybackMember(c, gId, uId, c.manager.players.get(gId));
            if (access.status !== "OK") return access.status;
            const member = access.member;
            const { resolveDashboardTrack, refreshIdleDashboardVoice } = require(playbackPath);
            let player = c.manager.players.get(gId);
            if (!player) {
                player = await c.manager.createPlayer({ guildId: gId, voiceId: member.voice.channel.id, textId: member.voice.channel.id, deaf: true });
            } else if (player.voiceId !== member.voice.channel.id) {
                return "DIFFERENT_VOICE_CHANNEL";
            }
            const resolved = [];
            let failedCount = 0;
            for (const input of Array.isArray(trks) ? trks : []) {
                try { resolved.push(await resolveDashboardTrack(c, player, input, member.user)); }
                catch { failedCount++; }
            }
            if (!resolved.length) return { success: false, addedCount: 0, failedCount, error: "No playable audio was found in this playlist." };
            if (!player.playing && !player.paused) await refreshIdleDashboardVoice(player, member.voice.channel.id);
            const hadCurrentTrack = Boolean(player.queue.current);
            for (const song of resolved) song.requestSource = src || "dashboard_playlist";
            if (shouldClear && hadCurrentTrack && (player.playing || player.paused)) {
                // Resume before changing the queue, then replace directly so track/queue loops cannot reinsert the old song.
                await player.shoukaku.setPaused(false);
                player.paused = false;
                player.playing = true;
                const previousCurrent = player.queue.current;
                const previousQueue = Array.from(player.queue);
                try {
                    await player.play(resolved[0], { replaceCurrent: true });
                    if (player.queue.current !== resolved[0]) throw new Error("The audio server could not start this playlist. Try another song.");
                } catch (error) {
                    player.queue.current = previousCurrent;
                    player.queue.splice(0, player.queue.length, ...previousQueue);
                    throw error;
                }
                player.queue.clear();
                for (const song of resolved.slice(1)) player.queue.add(song);
            } else {
                if (shouldClear) player.queue.clear();
                for (const song of resolved) player.queue.add(song);
                if (!player.playing && !player.paused) {
                    await player.play();
                    if (!player.queue.current) throw new Error("The audio server could not start this playlist. Try another song.");
                }
            }
            await require(loggerPath)(c, guild, member.user, "Queued playlist with " + resolved.length + (resolved.length === 1 ? " track" : " tracks"), null, { source: src || "dashboard_playlist" });
            return { success: true, addedCount: resolved.length, failedCount };
        }, { context: { gId: guildId, uId: userId, trks: tracks, src: source, shouldClear: Boolean(clearQueue), loggerPath: ACTION_LOGGER_PATH, accessPath: BRIDGE_ACCESS_PATH, playbackPath: DASHBOARD_PLAYBACK_PATH } });
        const payload = results.find(result => result && result !== false) || { success: false, addedCount: 0, failedCount: 0 };
        if (typeof payload === "string") return res.json({ success: false, status: payload, addedCount: 0, failedCount: 0 });
        res.json(payload);
    } catch (error) {
        res.status(502).json({ success: false, error: error.message, addedCount: 0, failedCount: 0 });
    }
});

io.on("connection", (socket) => {
    const authorization = socket.data.authorization;
    socket.join(`guild:${authorization.guildId}`);
    const expiry = setTimeout(() => socket.disconnect(true), authorization.expiresAt - Date.now());
    expiry.unref?.();
    Logger.system("Dashboard client connected");
    socket.on("disconnect", () => {
        clearTimeout(expiry);
        Logger.system("Dashboard client disconnected");
    });
});

manager.on("clusterCreate", (cluster) => {
  Logger.system(`Started Cluster #${cluster.id}`);
  
  cluster.on("message", (message) => {
      if (message && message.type === "DASHBOARD_EVENT") {
          if (/^\d{17,20}$/.test(message.data?.guildId || "")) {
              io.to(`guild:${message.data.guildId}`).emit(message.event, message.data);
          }
      }
  });
});

console.clear();
// Kreo Banner
console.log(`\x1b[36m
    ( o.o )  KREO
   ( > ^ < ) BOT
\x1b[0m`);
Logger.ready("System Initialized! Spawning Clusters...");

app.get("/api/guild/:id/roles", async (req, res) => {
    try {
        const guildId = req.params.id;
        const results = await manager.broadcastEval((c, gId) => {
            const guild = c.guilds.cache.get(gId);
            if (!guild) return null;
            
            return guild.roles.cache
                .filter(r => r.name !== "@everyone" && !r.managed)
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
        }, { context: guildId });

        const validResult = results.find(r => r !== null);
        if (validResult) res.json(validResult);
        else res.status(404).json({ error: "Guild not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/settings/update", async (req, res) => {
    const { guildId, type } = req.body;
    try {
        await manager.broadcastEval(async (c, { gId, t, autoReconnectSchemaPath }) => {
            if (t === "prefix") {
                // The bot fetches prefix from DB on every message, so no need to do anything special
                // unless we want to clear a cache if it existed.
            } else if (t === "247") {
                // If 24/7 was enabled, we might want the bot to join the channel now
                const db = require(autoReconnectSchemaPath);
                const data = await db.findOne({ Guild: gId });
                if (data) {
                    const guild = c.guilds.cache.get(gId);
                    if (guild) {
                        const voice = guild.channels.cache.get(data.VoiceId);
                        if (voice) {
                            let player = c.manager.players.get(gId);
                            if (!player) {
                                player = await c.manager.createPlayer({
                                    guildId: gId,
                                    voiceId: data.VoiceId,
                                    textId: data.TextId,
                                    deaf: true,

                                });
                            }
                        }
                    }
                } else {
                    // If 24/7 was disabled, and bot is just idling, maybe leave?
                    const player = c.manager.players.get(gId);
                    if (player && !player.playing && !player.paused) {
                        player.destroy();
                    }
                }
            }
        }, { context: { gId: guildId, t: type, autoReconnectSchemaPath: AUTO_RECONNECT_SCHEMA_PATH } });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

server.listen(BRIDGE_PORT, () => {
    Logger.system(`Bot Bridge API listening on port ${BRIDGE_PORT}`);
    const { startDashboardTunnel } = require("./src/utils/dashboardTunnel");
    const tunnel = startDashboardTunnel({ localPort: BRIDGE_PORT, logger: Logger });
    server.on("close", () => tunnel.close());
});

manager.spawn({ timeout: -1 });

