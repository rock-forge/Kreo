const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const { EventEmitter, once } = require("node:events");
const { KazagumoPlayer, KazagumoTrack } = require("kazagumo");

const root = path.resolve(__dirname, "..");
const guildId = "111111111111111111";
const userId = "333333333333333333";
const voiceId = "444444444444444444";
const secret = "dashboard-playback-regression-secret";

function rawTrack(encoded = "playable-audio") {
  return { encoded, info: { sourceName: "youtube", identifier: encoded, title: "Sahiba", author: "Aditya Rikhari",
    uri: "https://www.youtube.com/watch?v=test-audio", length: 187000, isSeekable: true, isStream: false } };
}

function fixture() {
  const order = [], events = [], logs = [];
  const member = { user: { id: userId, username: "Listener" }, voice: { channel: { id: voiceId } } };
  const queue = [];
  queue.current = null;
  queue.add = (song) => { order.push("add"); queue.push(song); };
  queue.clear = () => { order.push("clear"); queue.splice(0); };
  const player = {
    voiceId, queue, playing: false, paused: false, volume: 75,
    data: new Map([["lastActivityTime", Date.now() - 6 * 60_000]]),
    shoukaku: { node: { name: "test-node", rest: { decode: async (encoded) => rawTrack(encoded) } },
      setPaused: async () => {}, stopTrack: async () => {} },
    setVoiceChannel: async (id) => { assert.equal(id, voiceId); order.push("refresh"); },
    search: async () => ({ tracks: [] }),
    play: async () => { order.push("play"); queue.current = queue.shift() || null; player.playing = Boolean(queue.current); },
  };
  const client = {
    config: { node_source: "ytmsearch" }, guilds: { cache: new Map([[guildId, { id: guildId }]]) },
    manager: { players: new Map([[guildId, player]]), search: async () => ({ tracks: [] }),
      createPlayer: async () => { throw new Error("This fixture already has a player"); } },
    cluster: { send: async (event) => { events.push(event); } },
  };
  return { client, player, queue, member, order, events, logs };
}

function realPlayerFixture(loop = "none", paused = false) {
  const f = fixture();
  const shoukaku = new EventEmitter();
  const played = [], stopped = [];
  shoukaku.node = f.player.shoukaku.node;
  shoukaku.setPaused = async (value) => { f.order.push(`paused:${value}`); };
  shoukaku.playTrack = async (options) => {
    played.push(options.track.encoded);
    shoukaku.emit("end", { reason: "replaced" });
    shoukaku.emit("start");
  };
  shoukaku.stopTrack = async () => { stopped.push(true); shoukaku.emit("end", { reason: "stopped" }); };
  const player = new KazagumoPlayer({ KazagumoOptions: { defaultSearchEngine: "ytmsearch" }, emit() {} }, shoukaku,
    { guildId, voiceId, textId: voiceId, volume: 100, deaf: true });
  player.loop = loop;
  player.paused = paused;
  player.playing = !paused;
  player.queue.current = new KazagumoTrack(rawTrack("old-current"), f.member.user);
  player.queue.add(new KazagumoTrack(rawTrack("old-queued"), f.member.user));
  f.client.manager.players.set(guildId, player);
  return { ...f, player, queue: player.queue, played, stopped };
}

// Execute the real routes and cluster callback bodies; only service boundaries are replaced.
async function startBridge(f) {
  let server;
  class Manager extends EventEmitter {
    spawn() {}
    async broadcastEval(callback, options) { return [await callback(f.client, options.context)]; }
  }
  const context = vm.createContext({
    __dirname: root, process: { env: { NODE_ENV: "production" } }, URL, Set, Number, Boolean, Math, Date, Promise, Buffer,
    setTimeout, clearTimeout, console: { log() {}, clear() {} },
    require(name) {
      const normalized = name.replace(/\\/g, "/");
      if (name === "./src/config") return { token: "test", dashboard: { bridgeSecret: secret, nextAuthUrl: "https://dashboard.test" } };
      if (name === "./src/utils/logger") return new Proxy({}, { get: () => () => {} });
      if (normalized.endsWith("/src/utils/bridgeAccess.js")) return { getPlaybackMember: async (client, guild, user) => {
        assert.equal(client, f.client); assert.equal(guild, guildId); assert.equal(user, userId);
        return { status: "OK", member: f.member };
      } };
      if (normalized.endsWith("/src/utils/actionLogger.js")) return async (...args) => { f.logs.push(args); };
      if (name === "./src/utils/dashboardTunnel") return { startDashboardTunnel: () => ({ close() {} }) };
      if (name === "discord-hybrid-sharding") return { ClusterManager: Manager };
      if (name === "http") return { createServer(app) {
        server = http.createServer(app);
        const listen = server.listen.bind(server);
        server.listen = (_port, callback) => listen(0, "127.0.0.1", callback);
        return server;
      } };
      if (name.startsWith("./")) return require(path.join(root, name));
      return require(name);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "devrock.js"), "utf8"), context);
  if (!server.listening) await once(server, "listening");
  return {
    async post(route, body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-kreo-bridge-secret": secret, Connection: "close" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, body: await response.json() };
    },
    close: () => vm.runInContext("new Promise(resolve => io.close(resolve))", context),
  };
}

test("dashboard search uses the configured audio engine and leaves direct links unprefixed", async (t) => {
  const f = fixture(), searches = [];
  f.client.manager.search = async (query, options) => {
    searches.push({ query, engine: options.engine });
    return { tracks: [new KazagumoTrack(rawTrack(), f.member.user)] };
  };
  const bridge = await startBridge(f); t.after(() => bridge.close());
  for (const engine of ["scsearch", "ytmsearch"]) {
    f.client.config.node_source = engine;
    const result = await bridge.post("search", { query: "Sahiba" });
    assert.equal(result.status, 200);
    assert.equal(result.body.results.tracks.length, 1);
    assert.equal(searches.at(-1).engine, engine, "must not hardcode the Spotify catalog search");
  }
  await bridge.post("search", { query: "https://www.youtube.com/watch?v=test-audio" });
  assert.equal(searches.at(-1).engine, undefined);
});

test("single dashboard play refreshes stale idle voice before adding and starting real audio", async (t) => {
  const f = fixture();
  const previousActivity = f.player.data.get("lastActivityTime");
  const bridge = await startBridge(f); t.after(() => bridge.close());
  const result = await bridge.post("play", { guildId, userId, track: { track: "encoded-audio" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(f.order, ["refresh", "add", "play"]);
  assert.ok(f.queue.current instanceof KazagumoTrack);
  assert.equal(f.queue.current.track, "encoded-audio");
  assert.equal(f.queue.current.requester, f.member.user);
  assert.equal(f.queue.current.requestSource, "dashboard");
  assert.ok(f.player.data.get("lastActivityTime") > previousActivity);
});

test("a resolver failure cannot report dashboard playback success or modify the queue", async (t) => {
  const f = fixture();
  f.player.shoukaku.node.rest.decode = async () => { throw new Error("Invalid encoding"); };
  const bridge = await startBridge(f); t.after(() => bridge.close());
  const result = await bridge.post("play", { guildId, userId, track: { track: "invalid", title: "Missing song" } });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /No playable audio/);
  assert.deepEqual(f.order, []);
  assert.equal(f.queue.length, 0);
});

test("a soft player start failure cannot return success with no current track", async (t) => {
  const f = fixture();
  f.player.play = async () => { f.order.push("play"); f.queue.shift(); };
  const bridge = await startBridge(f); t.after(() => bridge.close());
  const result = await bridge.post("play", { guildId, userId, track: { track: "encoded-audio" } });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /could not start this track/i);
  assert.equal(f.queue.current, null);
});

for (const action of ["pause", "resume"]) {
  test(`failed ${action} waits for audio REST and preserves flags without publishing a state change`, async (t) => {
    const f = fixture();
    f.queue.current = new KazagumoTrack(rawTrack(), f.member.user);
    f.player.paused = action === "resume";
    f.player.playing = !f.player.paused;
    const originalFlags = { playing: f.player.playing, paused: f.player.paused };
    let rejectRest, enteredRest;
    const entered = new Promise((resolve) => { enteredRest = resolve; });
    f.player.shoukaku.setPaused = (paused) => {
      assert.equal(paused, action === "pause");
      enteredRest();
      return new Promise((_resolve, reject) => { rejectRest = reject; });
    };
    // The old Kazagumo API mutates flags before its unawaited REST call.
    f.player.pause = (paused) => { f.player.paused = paused; f.player.playing = !paused; return f.player.shoukaku.setPaused(paused); };
    const bridge = await startBridge(f); t.after(() => bridge.close());
    const pending = bridge.post("player", { guildId, userId, action });
    await entered;
    assert.deepEqual({ playing: f.player.playing, paused: f.player.paused }, originalFlags);
    assert.deepEqual(f.events, []);
    rejectRest(new Error("Audio REST unavailable"));
    const result = await pending;
    assert.equal(result.body.success, false);
    assert.match(result.body.error, /Audio REST unavailable/);
    assert.deepEqual({ playing: f.player.playing, paused: f.player.paused }, originalFlags);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.logs, []);
  });
}

test("an all-invalid replacement playlist preserves existing queued and current audio", async (t) => {
  const f = fixture();
  const current = new KazagumoTrack(rawTrack("current-audio"), f.member.user);
  const oldSong = new KazagumoTrack(rawTrack("queued-audio"), f.member.user);
  f.queue.current = current; f.queue.push(oldSong); f.player.playing = true;
  f.player.shoukaku.node.rest.decode = async () => { throw new Error("Invalid encoding"); };
  const bridge = await startBridge(f); t.after(() => bridge.close());
  const result = await bridge.post("play-batch", { guildId, userId, clearQueue: true,
    tracks: [{ track: "bad-one", title: "Missing song one" }, { track: "bad-two", title: "Missing song two" }] });
  assert.equal(result.body.success, false);
  assert.equal(result.body.addedCount, 0);
  assert.equal(result.body.failedCount, 2);
  assert.match(result.body.error, /No playable audio/);
  assert.equal(f.queue.current, current);
  assert.equal(f.queue.length, 1);
  assert.equal(f.queue[0], oldSong);
  assert.deepEqual(f.order, []);
  assert.deepEqual(f.logs, []);
  assert.equal(f.player.playing, true);
});

for (const loop of ["none", "track", "queue"]) {
  test(`replacing a playlist starts new audio without reinserting the old current song with ${loop} loop`, async (t) => {
    const f = realPlayerFixture(loop, loop === "track");
    const bridge = await startBridge(f); t.after(() => bridge.close());
    const result = await bridge.post("play-batch", { guildId, userId, clearQueue: true,
      tracks: [{ track: "new-first" }, { track: "new-second" }] });
    assert.equal(result.body.success, true);
    assert.equal(result.body.addedCount, 2);
    assert.deepEqual(f.played, ["new-first"]);
    assert.deepEqual(f.stopped, [], "normal stopped-track end handling must not run during replacement");
    assert.equal(f.queue.current.track, "new-first");
    assert.deepEqual(Array.from(f.queue, song => song.track), ["new-second"]);
    assert.equal(f.player.loop, loop, "the user's loop choice is preserved for the new playlist");
    assert.equal(f.player.paused, false);
    assert.equal(f.player.playing, true);
    assert.equal(f.queue.current.requestSource, "dashboard_playlist");
    assert.equal(f.queue[0].requestSource, "dashboard_playlist");
  });
}

test("replacement resume REST rejection preserves the actual Kazagumo queue and current track", async (t) => {
  const f = realPlayerFixture("track", true);
  const previousCurrent = f.queue.current;
  const previousQueued = Array.from(f.queue);
  f.player.shoukaku.setPaused = async () => { throw new Error("Resume REST rejected"); };
  const bridge = await startBridge(f); t.after(() => bridge.close());
  const result = await bridge.post("play-batch", { guildId, userId, clearQueue: true, tracks: [{ track: "new-first" }] });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /Resume REST rejected/);
  assert.equal(f.queue.current, previousCurrent);
  assert.deepEqual(Array.from(f.queue), previousQueued);
  assert.equal(f.player.paused, true);
  assert.equal(f.player.playing, false);
  assert.deepEqual(f.played, []);
  assert.deepEqual(f.stopped, []);
  assert.deepEqual(f.logs, []);
});

test("replacement playback REST rejection restores the current track and preserves queued songs", async (t) => {
  const f = realPlayerFixture("queue");
  const previousCurrent = f.queue.current;
  const previousQueued = Array.from(f.queue);
  f.player.shoukaku.playTrack = async () => { throw new Error("Playback REST rejected"); };
  const bridge = await startBridge(f); t.after(() => bridge.close());
  const result = await bridge.post("play-batch", { guildId, userId, clearQueue: true, tracks: [{ track: "new-first" }] });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /Playback REST rejected/);
  assert.equal(f.queue.current, previousCurrent);
  assert.deepEqual(Array.from(f.queue), previousQueued);
  assert.deepEqual(f.stopped, []);
  assert.deepEqual(f.logs, []);
});
