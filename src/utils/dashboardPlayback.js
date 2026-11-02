const { KazagumoTrack } = require("kazagumo");

const IDLE_REFRESH_MS = 5 * 60 * 1000;
const refreshes = new WeakMap();
const catalogEngines = new Set(["spsearch", "spotify", "amsearch", "applemusic", "apple_music", "dzsearch", "deezer", "jssearch", "jiosaavn"]);

function normalized(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\s*-\s*topic\s*$/i, "")
    .replace(/[\[(][^\])]*(?:official|lyrics|audio|video)[^\])]*[\])]/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function audioEngines(client, player) {
  const configured = client.config?.node_source || player.kazagumo?.defaultSearchEngine || client.manager?.defaultSearchEngine;
  return [...new Set([configured && !catalogEngines.has(String(configured).toLowerCase()) ? configured : null, "ytmsearch", "ytsearch"].filter(Boolean))];
}

function asTrack(value, requester, encoded) {
  if (value instanceof KazagumoTrack) {
    value.requester = requester;
    return value;
  }
  if (!value?.info) return null;
  const raw = { ...value, encoded: value.encoded || encoded };
  return new KazagumoTrack(raw, requester);
}

function isAudio(track) {
  return Boolean(track instanceof KazagumoTrack && typeof track.track === "string" && track.track && track.sourceName &&
    String(track.sourceName).toLowerCase() !== "spotify" && track.identifier && track.title && track.uri);
}

function matchScore(candidate, reference) {
  const title = normalized(reference.title);
  const candidateTitle = normalized(candidate.title);
  if (!title || !candidateTitle) return 0;
  const titleWords = new Set(title.split(" "));
  const candidateWords = new Set(candidateTitle.split(" "));
  const overlap = [...titleWords].filter(word => candidateWords.has(word)).length;
  let score = title === candidateTitle ? 140 : candidateTitle.includes(title) || title.includes(candidateTitle) ? 90 :
    100 * 2 * overlap / (titleWords.size + candidateWords.size);
  if (score < 55) return 0;
  const author = normalized(reference.author);
  const candidateAuthor = normalized(candidate.author);
  if (author && candidateAuthor) {
    if (author === candidateAuthor) score += 70;
    else if (candidateAuthor.includes(author) || author.includes(candidateAuthor)) score += 45;
    else if (candidateTitle.includes(author)) score += 55;
  }
  const duration = Number(reference.length);
  const candidateDuration = Number(candidate.length);
  if (duration > 0 && candidateDuration > 0) {
    const difference = Math.abs(candidateDuration - duration);
    if (difference <= 2000) score += 30;
    else if (difference <= 8000) score += 20;
    else if (difference > Math.max(30000, duration * .2)) score -= 35;
  }
  for (const variant of ["cover", "remix", "slowed", "reverb", "sped up", "karaoke"]) {
    if (candidateTitle.includes(variant) && !title.includes(variant)) score -= 40;
  }
  return score;
}

async function searchTracks(client, player, query, requester, engine) {
  const owner = typeof player.search === "function" ? player : client.manager;
  if (!owner || typeof owner.search !== "function") throw new Error("Music search is unavailable. Please try again.");
  const result = await owner.search(query, { requester, engine, nodeName: player.shoukaku?.node?.name });
  return (Array.isArray(result?.tracks) ? result.tracks : []).map(value => asTrack(value, requester)).filter(Boolean);
}

async function resolveSpotifyAudio(client, player, reference, requester) {
  const title = String(reference.title || "").trim();
  if (!title) throw new Error("This track has no song title to resolve. Try another search result.");
  const author = String(reference.author || "").replace(/\s*-\s*Topic\s*$/i, "").trim();
  const query = [title, author].filter(Boolean).join(" ");
  let best = null;
  let bestScore = 0;
  for (const engine of audioEngines(client, player)) {
    const candidates = await searchTracks(client, player, query, requester, engine).catch(() => []);
    for (const candidate of candidates) {
      if (!isAudio(candidate)) continue;
      const score = matchScore(candidate, reference);
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    if (bestScore >= 190) return best;
  }
  if (best && bestScore >= 90) return best;
  throw new Error("No playable audio was found for this song. Try a different result.");
}

async function resolveDashboardTrack(client, player, input, requester) {
  const trackInput = typeof input === "string" ? { uri: input } : input;
  if (!trackInput || typeof trackInput !== "object") throw new Error("Choose a song or paste a valid track link.");
  let decoded = null;
  const encoded = typeof trackInput.track === "string" ? trackInput.track : trackInput.encoded;
  if (encoded && typeof player.shoukaku?.node?.rest?.decode === "function") {
    try { decoded = asTrack(await player.shoukaku.node.rest.decode(encoded), requester, encoded); } catch {}
  }
  if (decoded && String(decoded.sourceName).toLowerCase() === "spotify") {
    return resolveSpotifyAudio(client, player, { ...trackInput, ...decoded, title: decoded.title || trackInput.title,
      author: decoded.author || trackInput.author, length: decoded.length || trackInput.length }, requester);
  }
  if (isAudio(decoded)) return decoded;
  if (!decoded && String(trackInput.sourceName || "").toLowerCase() === "spotify" && trackInput.title) {
    return resolveSpotifyAudio(client, player, trackInput, requester);
  }

  const lookup = trackInput.uri || trackInput.url || [trackInput.title, trackInput.author].filter(Boolean).join(" ");
  if (typeof lookup !== "string" || !lookup.trim()) throw new Error("Choose a song or paste a valid track link.");
  for (const engine of audioEngines(client, player)) {
    const candidates = await searchTracks(client, player, lookup.trim(), requester, engine).catch(() => []);
    if (!candidates.length) continue;
    const selected = candidates.find(candidate => isAudio(candidate) || String(candidate.sourceName || "").toLowerCase() === "spotify");
    if (!selected) continue;
    if (String(selected.sourceName || "").toLowerCase() === "spotify") {
      return resolveSpotifyAudio(client, player, selected, requester);
    }
    if (isAudio(selected)) return selected;
  }
  throw new Error("No playable audio was found for this track. Try another result.");
}

async function refreshIdleDashboardVoice(player, channelId) {
  if (!player || player.playing || player.paused || !channelId || player.voiceId !== channelId) return false;
  const lastActivity = Number(player.data?.get("lastActivityTime") || player.data?.get("monitorStartTime"));
  if (!Number.isFinite(lastActivity) || lastActivity <= 0 || Date.now() - lastActivity <= IDLE_REFRESH_MS) return false;
  const pending = refreshes.get(player);
  if (pending) return pending;
  const refresh = (async () => {
    await player.setVoiceChannel(channelId);
    player.data?.set("lastActivityTime", Date.now());
    return true;
  })();
  refreshes.set(player, refresh);
  try { return await refresh; }
  finally { if (refreshes.get(player) === refresh) refreshes.delete(player); }
}

module.exports = { resolveDashboardTrack, refreshIdleDashboardVoice };
