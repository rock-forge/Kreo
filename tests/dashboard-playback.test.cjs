const { test } = require("node:test");
const assert = require("node:assert/strict");
const { KazagumoTrack } = require("kazagumo");
const { resolveDashboardTrack, refreshIdleDashboardVoice } = require("../src/utils/dashboardPlayback");

const requester = { id: "123456789012345678", username: "Listener" };
function raw(sourceName, overrides = {}) {
  return { encoded: sourceName + "-encoded", info: { sourceName, title: "Sahiba", author: "Aditya Rikhari", identifier: sourceName + "-id",
    uri: "https://example.invalid/" + sourceName, length: 187000, isSeekable: true, isStream: false, artworkUrl: "https://example.invalid/cover.png", ...overrides } };
}
function track(sourceName, overrides) { return new KazagumoTrack(raw(sourceName, overrides), requester); }
function fixture({ source = "ytmsearch", decode = async () => raw("spotify"), search = async () => ({ tracks: [] }) } = {}) {
  const searches = [], decodes = [];
  const player = { voiceId: "223456789012345678", playing: false, paused: false, data: new Map(),
    shoukaku: { node: { name: "chosen-node", rest: { decode: async encoded => { decodes.push(encoded); return decode(encoded); } } } },
    search: async (query, options) => { searches.push({ query, options }); return search(query, options); },
  };
  return { player, searches, decodes, client: { config: { node_source: source } } };
}

test("Spotify metadata bypasses Kazagumo resolution, so dashboard explicitly resolves matching playable audio", async () => {
  const spotify = track("spotify");
  let kazagumoSearches = 0;
  const kazagumo = { KazagumoOptions: { defaultSearchEngine: "ytmsearch" }, emit() {}, search: async () => { kazagumoSearches++; throw new Error("Must not be silently skipped"); } };
  spotify.setKazagumo(kazagumo);
  assert.equal(spotify.readyToPlay, true);
  await spotify.resolve();
  assert.equal(kazagumoSearches, 0, "Proves the original Spotify encoding would have bypassed audio lookup");

  const audio = track("youtube");
  const f = fixture({ source: "spsearch", search: async () => ({ tracks: [track("youtube", { title: "Sahiba remix", author: "Other DJ", length: 270000 }), audio] }) });
  const resolved = await resolveDashboardTrack(f.client, f.player, { track: spotify.track, sourceName: "spotify", title: "Sahiba", author: "Aditya Rikhari" }, requester);
  assert.equal(resolved, audio);
  assert.ok(resolved instanceof KazagumoTrack);
  assert.equal(resolved.track, "youtube-encoded");
  assert.equal(resolved.sourceName, "youtube");
  assert.equal(f.decodes[0], "spotify-encoded");
  assert.equal(f.searches[0].query, "Sahiba Aditya Rikhari");
  assert.equal(f.searches[0].options.engine, "ytmsearch");
  assert.equal(f.searches[0].options.nodeName, "chosen-node");
  resolved.setKazagumo(kazagumo);
  await resolved.resolve();
  assert.equal(kazagumoSearches, 0, "Resolved encoding is already playable without another search");
});

test("valid encoded non-YouTube audio is retained without a replacement search", async () => {
  const f = fixture({ decode: async () => raw("soundcloud") });
  const resolved = await resolveDashboardTrack(f.client, f.player, { track: "original-soundcloud" }, requester);
  assert.ok(resolved instanceof KazagumoTrack);
  assert.equal(resolved.sourceName, "soundcloud");
  assert.equal(resolved.track, "soundcloud-encoded");
  assert.equal(resolved.requester, requester);
  assert.equal(f.searches.length, 0);
});

test("Spotify audio lookup falls back to YouTube and selects a title, artist and duration match", async () => {
  const correct = track("youtube", { title: "Sahiba (Official Audio)", author: "Aditya Rikhari - Topic" });
  const f = fixture({ source: "amsearch", search: async (_query, options) => ({ tracks: options.engine === "ytmsearch" ? [track("spotify")] :
    [track("youtube", { title: "Unrelated song", author: "Aditya Rikhari" }), track("youtube", { author: "Another singer", length: 320000 }), correct] }) });
  const result = await resolveDashboardTrack(f.client, f.player, { track: "catalog" }, requester);
  assert.equal(result, correct);
  assert.deepEqual(f.searches.map(item => item.options.engine), ["ytmsearch", "ytsearch"]);
});

test("unresolved Spotify metadata and unrelated audio fail instead of reporting successful playback", async () => {
  const f = fixture({ search: async () => ({ tracks: [track("spotify"), track("youtube", { title: "Completely different music", author: "Someone else" })] }) });
  await assert.rejects(resolveDashboardTrack(f.client, f.player, { track: "catalog" }, requester), /No playable audio/);
});

test("saved Spotify URLs resolve server-side before the playable source is chosen", async () => {
  const audio = track("youtube");
  const f = fixture({ search: async query => ({ tracks: query.startsWith("https:") ? [track("spotify")] : [audio] }) });
  const result = await resolveDashboardTrack(f.client, f.player, { url: "https://open.spotify.com/track/saved-song" }, requester);
  assert.equal(result, audio);
  assert.equal(f.searches[0].query, "https://open.spotify.com/track/saved-song");
  assert.equal(f.searches[1].query, "Sahiba Aditya Rikhari");
});

test("invalid encodings can fall back to a server lookup, while missing tracks reject", async () => {
  const f = fixture({ decode: async () => { throw new Error("Invalid encoding"); }, search: async () => ({ tracks: [track("soundcloud")] }) });
  assert.equal((await resolveDashboardTrack(f.client, f.player, { track: "invalid", uri: "https://example.invalid/direct-audio" }, requester)).sourceName, "soundcloud");
  await assert.rejects(resolveDashboardTrack(f.client, f.player, {}, requester), /Choose a song/);
  const empty = fixture();
  await assert.rejects(resolveDashboardTrack(empty.client, empty.player, { title: "Missing song" }, requester), /No playable audio/);
});

test("idle dashboard voice refresh finishes before playback and updates activity only after success", async () => {
  const f = fixture();
  const old = Date.now() - 360000;
  f.player.data.set("lastActivityTime", old);
  const actions = [];
  let complete;
  f.player.setVoiceChannel = channel => { actions.push(["refresh", channel]); return new Promise(resolve => { complete = resolve; }); };
  const pending = refreshIdleDashboardVoice(f.player, f.player.voiceId);
  const duplicate = refreshIdleDashboardVoice(f.player, f.player.voiceId);
  assert.equal(f.player.data.get("lastActivityTime"), old);
  assert.equal(actions.length, 1);
  complete();
  assert.equal(await pending, true);
  assert.equal(await duplicate, true);
  actions.push(["play"]);
  assert.deepEqual(actions, [["refresh", f.player.voiceId], ["play"]]);
  assert.ok(f.player.data.get("lastActivityTime") > old);
});

test("fresh, paused, active and other-channel players never refresh unnecessarily", async () => {
  for (const state of [{ age: 1000 }, { age: 360000, paused: true }, { age: 360000, playing: true }, { age: 360000, differentChannel: true }, { missingActivity: true }]) {
    const f = fixture();
    Object.assign(f.player, { paused: Boolean(state.paused), playing: Boolean(state.playing) });
    if (!state.missingActivity) f.player.data.set("lastActivityTime", Date.now() - state.age);
    f.player.setVoiceChannel = () => { throw new Error("Should not refresh"); };
    assert.equal(await refreshIdleDashboardVoice(f.player, state.differentChannel ? "other-channel" : f.player.voiceId), false);
  }
});

test("failed idle refresh preserves its activity timestamp and can be retried", async () => {
  const f = fixture();
  const old = Date.now() - 360000;
  f.player.data.set("monitorStartTime", old);
  f.player.setVoiceChannel = () => { throw new Error("Voice refresh failed"); };
  await assert.rejects(refreshIdleDashboardVoice(f.player, f.player.voiceId), /Voice refresh failed/);
  assert.equal(f.player.data.has("lastActivityTime"), false);
  f.player.setVoiceChannel = () => {};
  assert.equal(await refreshIdleDashboardVoice(f.player, f.player.voiceId), true);
  assert.ok(f.player.data.get("lastActivityTime") > old);
});
