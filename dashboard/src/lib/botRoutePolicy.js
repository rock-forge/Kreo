const SNOWFLAKE = /^\d{17,20}$/;
const LIMITS = {
  "bot-guilds": { limit: 20, windowMs: 60_000 },
  search: { limit: 12, windowMs: 60_000 },
  play: { limit: 15, windowMs: 60_000 },
  "play-batch": { limit: 8, windowMs: 60_000 },
  player: { limit: 30, windowMs: 60_000 },
  lyrics: { limit: 20, windowMs: 60_000 },
  guild: { limit: 60, windowMs: 60_000 },
  meta: { limit: 20, windowMs: 60_000 },
};

export function resolveBotRoute(segments, method, body) {
  if (!Array.isArray(segments) || !segments.length || segments.some((part) =>
    typeof part !== "string" || !/^[A-Za-z0-9-]+$/.test(part))) return null;
  const path = segments.join("/");
  if (method === "POST" && segments.length === 1 &&
      ["bot-guilds", "search", "play", "play-batch", "player"].includes(path)) {
    const requiresGuild = ["play", "play-batch", "player"].includes(path);
    if (requiresGuild && (typeof body?.guildId !== "string" || !SNOWFLAKE.test(body.guildId))) return null;
    return { path, key: path, guildId: requiresGuild ? body.guildId : null,
      scope: path === "bot-guilds" ? "guild-list" : requiresGuild ? "member" : "session", rate: LIMITS[path] };
  }
  if (method !== "GET" || !SNOWFLAKE.test(segments[1] || "")) return null;
  if (segments[0] === "lyrics" && segments.length === 2) {
    return { path, key: "lyrics", guildId: segments[1], scope: "member", rate: LIMITS.lyrics };
  }
  if (segments[0] !== "guild") return null;
  if (segments.length === 2) return { path, key: "guild", guildId: segments[1], scope: "member", rate: LIMITS.guild };
  if (segments.length === 3 && ["channels", "roles"].includes(segments[2])) {
    return { path, key: segments[2], guildId: segments[1], scope: "manager", rate: LIMITS.meta };
  }
  return null;
}

export function validateBotBody(path, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Invalid request body";
  if (path === "bot-guilds" && (!Array.isArray(body.guildIds) || body.guildIds.length > 200 ||
      body.guildIds.some((id) => typeof id !== "string" || !SNOWFLAKE.test(id)))) return "Invalid server list";
  if (path === "search" && (typeof body.query !== "string" || !body.query.trim() || body.query.length > 500)) return "Enter a search query of up to 500 characters";
  if (path === "play" && (!body.track || typeof body.track !== "object" || Array.isArray(body.track))) return "Invalid track";
  if (path === "play-batch" && (!Array.isArray(body.tracks) || body.tracks.length < 1 || body.tracks.length > 150 ||
      body.tracks.some((track) => !track || typeof track !== "object" || Array.isArray(track)))) return "Choose between 1 and 150 tracks";
  if (path === "player") {
    if (!["pause", "resume", "skip", "previous", "setVolume", "seek", "removeTrack", "clearQueue"].includes(body.action)) return "Unsupported player action";
    const payload = body.payload;
    if (body.action === "setVolume" && (!Number.isInteger(payload?.volume) || payload.volume < 1 || payload.volume > 100)) return "Volume must be between 1 and 100";
    if (body.action === "seek" && (!Number.isFinite(payload?.positionMs) || payload.positionMs < 0 || payload.positionMs > 86_400_000)) return "Invalid seek position";
    if (body.action === "removeTrack" && (!Number.isInteger(payload?.index) || payload.index < 0)) return "Invalid queue position";
  }
  return null;
}
