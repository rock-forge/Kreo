const snowflake = (value) => typeof value === "string" && /^\d{17,20}$/.test(value);

function validateBridgeRequest(path, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Invalid request body";
  if (["/play", "/play-batch", "/player", "/settings/update"].includes(path) && !snowflake(body.guildId)) return "Invalid server";
  if (["/play", "/play-batch", "/player"].includes(path) && !snowflake(body.userId)) return "Invalid user";
  if (path === "/bot-guilds" && (!Array.isArray(body.guildIds) || body.guildIds.length > 200 || body.guildIds.some((id) => !snowflake(id)))) return "Invalid server list";
  if (path === "/search" && (typeof body.query !== "string" || !body.query.trim() || body.query.length > 500)) return "Invalid search query";
  if (path === "/play" && (!body.track || typeof body.track !== "object" || Array.isArray(body.track))) return "Invalid track";
  if (path === "/play-batch" && (!Array.isArray(body.tracks) || !body.tracks.length || body.tracks.length > 150 || body.tracks.some((track) => !track || typeof track !== "object" || Array.isArray(track)))) return "Choose between 1 and 150 tracks";
  if (path === "/player") {
    if (!["pause", "resume", "skip", "previous", "setVolume", "seek", "removeTrack", "clearQueue"].includes(body.action)) return "Unsupported player action";
    if (body.action === "setVolume" && (!Number.isInteger(body.payload?.volume) || body.payload.volume < 1 || body.payload.volume > 100)) return "Volume must be between 1 and 100";
    if (body.action === "seek" && (!Number.isFinite(body.payload?.positionMs) || body.payload.positionMs < 0 || body.payload.positionMs > 86_400_000)) return "Invalid seek position";
    if (body.action === "removeTrack" && (!Number.isInteger(body.payload?.index) || body.payload.index < 0)) return "Invalid queue position";
  }
  return null;
}

module.exports = { validateBridgeRequest };
