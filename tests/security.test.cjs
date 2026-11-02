const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const http = require("node:http");
const { EventEmitter, once } = require("node:events");
const root = path.resolve(__dirname, "..");
const guildId = "111111111111111111";
const otherGuildId = "222222222222222222";
const userId = "333333333333333333";
const secret = "regression-test-secret";

async function loadEsm(file) {
  return import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(root, file), "utf8")).toString("base64")}`);
}

function ticket(guild = guildId, expiresAt = Date.now() + 240_000) {
  const data = Buffer.from(JSON.stringify({ guildId: guild, userId, expiresAt })).toString("base64url");
  return `${data}.${crypto.createHmac("sha256", secret).update(data).digest("base64url")}`;
}

test("the proxy rejects encoded traversal and unexpected methods or suffixes", async () => {
  const { resolveBotRoute } = await loadEsm("dashboard/src/lib/botRoutePolicy.js");
  for (const parts of [
    ["guild", guildId, "%2e%2e", "%2e%2e", "player"],
    ["guild", guildId, "..", "..", "player"],
    ["guild", `${guildId}/../../player`],
    ["guild", guildId, "anything"],
  ]) assert.equal(resolveBotRoute(parts, "POST", { guildId: otherGuildId }), null);
  assert.equal(resolveBotRoute(["player"], "GET", null), null);
  assert.equal(resolveBotRoute(["guild", guildId], "POST", {}), null);
  assert.equal(resolveBotRoute(["play"], "POST", {}), null);
  assert.equal(resolveBotRoute(["guild", guildId], "GET", null).guildId, guildId);
});

test("the proxy checks the target guild and replaces a forged actor", async () => {
  const { resolveBotRoute, validateBotBody } = await loadEsm("dashboard/src/lib/botRoutePolicy.js");
  let forwarded;
  const source = fs.readFileSync(path.join(root, "dashboard/src/app/api/bot/[...path]/route.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
  const context = vm.createContext({
    Headers, AbortSignal, console, Date, Math, JSON, Array, Set, resolveBotRoute, validateBotBody,
    NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
    getServerSession: async () => ({ accessToken: "test", user: { id: userId } }), authOptions: {},
    fetchDiscordGuilds: async () => [{ id: guildId }],
    getGuildAccess: (guilds, id) => ({ isMember: guilds.some((guild) => guild.id === id), canManage: false }),
    checkRateLimit: () => ({ allowed: true }), runtimeConfig: { dashboard: { botApiUrl: "http://bridge.test", bridgeSecret: secret } },
    fetch: async (url, init) => { forwarded = { url, body: JSON.parse(init.body) }; return { status: 200, text: async () => "{}" }; },
  });
  vm.runInContext(source, context);
  const post = (body, segments = ["player"]) => {
    context.req = { json: async () => body }; context.params = { path: segments };
    return vm.runInContext('POST(req, { params: Promise.resolve(params) })', context);
  };
  assert.equal((await post({ guildId: otherGuildId, action: "skip" })).status, 403);
  assert.equal(forwarded, undefined);
  assert.equal((await post({ guildId, action: "skip", userId: "forged" })).status, 200);
  assert.equal(forwarded.body.userId, userId);
  assert.equal(forwarded.url, "http://bridge.test/api/player");
});

test("both API layers reject invalid player inputs", async () => {
  const { validateBotBody } = await loadEsm("dashboard/src/lib/botRoutePolicy.js");
  const { validateBridgeRequest } = require("../src/utils/bridgePolicy");
  for (const body of [
    { action: "setVolume", payload: { volume: 10000 } },
    { action: "seek", payload: { positionMs: -1 } },
    { action: "removeTrack", payload: { index: 0.5 } },
    { action: "unknown" },
  ]) {
    assert.ok(validateBotBody("player", body));
    assert.ok(validateBridgeRequest("/player", { guildId, userId, ...body }));
  }
  assert.equal(validateBridgeRequest("/player", { guildId, userId, action: "skip" }), null);
  assert.ok(validateBotBody("play-batch", { tracks: Array.from({ length: 151 }, () => ({})) }));
});

test("socket tickets reject tampering, expiry and excessively long lifetimes", () => {
  const { verifySocketToken } = require("../src/utils/dashboardSocketAuth");
  assert.equal(verifySocketToken(ticket(), secret).guildId, guildId);
  assert.equal(verifySocketToken(ticket() + "bad", secret), null);
  assert.equal(verifySocketToken(ticket(guildId, Date.now() - 1), secret), null);
  assert.equal(verifySocketToken(ticket(guildId, Date.now() + 600_000), secret), null);
  assert.equal(verifySocketToken(ticket(), "wrong-secret"), null);
});

async function startBridge() {
  let manager;
  let server;
  class Manager extends EventEmitter { constructor() { super(); manager = this; } spawn() {} }
  const context = vm.createContext({
    __dirname: root, process: { env: { NODE_ENV: "production" } }, URL, Set, Number, Boolean, Math, Date, Promise, Buffer,
    setTimeout, clearTimeout, console: { log() {}, clear() {} },
    require(name) {
      if (name === "./src/config") return { token: "test", dashboard: { bridgeSecret: secret, nextAuthUrl: "https://dashboard.test" } };
      if (name === "./src/utils/logger") return new Proxy({}, { get: () => () => {} });
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
  return { url: `http://127.0.0.1:${server.address().port}`, manager,
    close: () => vm.runInContext("new Promise(resolve => io.close(resolve))", context) };
}

test("the running bridge rejects anonymous access and isolates socket events by guild", async () => {
  const { io } = require("socket.io-client");
  const bridge = await startBridge();
  const sockets = [];
  try {
    assert.equal((await fetch(`${bridge.url}/api/guild/${guildId}`)).status, 401);
    assert.equal((await fetch(`${bridge.url}/api/bot-guilds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guildIds: [guildId] }) })).status, 401);
    const anonymous = io(bridge.url, { transports: ["websocket"], reconnection: false, timeout: 2000 }); sockets.push(anonymous);
    assert.match((await once(anonymous, "connect_error"))[0].message, /Unauthorized/);
    const socket = io(bridge.url, { transports: ["websocket"], reconnection: false, auth: { token: ticket() }, timeout: 2000 }); sockets.push(socket);
    await once(socket, "connect");
    const received = [];
    socket.on("trackStart", (data) => received.push(data.guildId));
    const ownEvent = once(socket, "trackStart");
    const cluster = new EventEmitter(); cluster.id = 0; bridge.manager.emit("clusterCreate", cluster);
    for (const id of [otherGuildId, guildId]) cluster.emit("message", { type: "DASHBOARD_EVENT", event: "trackStart", data: { guildId: id } });
    await ownEvent;
    assert.deepEqual(received, [guildId]);
  } finally { for (const socket of sockets) socket.disconnect(); await bridge.close(); }
});

test("playback authorization rejects users outside the player's voice channel", async () => {
  const Blacklist = require("../src/schema/blacklist");
  const previous = Blacklist.findOne; Blacklist.findOne = () => ({ lean: async () => null });
  try {
    const { getPlaybackMember } = require("../src/utils/bridgeAccess");
    const member = { user: { id: userId, bot: false }, voice: { channel: null } };
    const client = { guilds: { cache: new Map([[guildId, { members: { fetch: async () => member } }]]) } };
    const player = { voiceId: "voice-one" };
    assert.equal((await getPlaybackMember(client, guildId, userId, player)).status, "NO_VOICE_CHANNEL");
    member.voice.channel = { id: "voice-two" };
    assert.equal((await getPlaybackMember(client, guildId, userId, player)).status, "DIFFERENT_VOICE_CHANNEL");
    member.voice.channel.id = "voice-one";
    assert.equal((await getPlaybackMember(client, guildId, userId, player)).status, "OK");
  } finally { Blacklist.findOne = previous; }
});

test("owner-only commands fail before database access for non-owners", async () => {
  const { getCommandRestriction } = require("../src/utils/commandAccess");
  assert.match(await getCommandRestriction({ config: { ownerID: ["owner"] } }, {
    command: { owner: true }, userId, guildId, channelId: "channel",
  }), /bot owners/);
});

test("the slash dispatcher enforces the owner's restriction for restart", async () => {
  let executed = false;
  const client = {
    config: { ownerID: ["owner"] }, prefix: ">", commands: new Map(),
    slashCommands: new Map([["restart", { name: "restart", owner: true, slashExecute: async () => { executed = true; } }]]),
  };
  const response = await require("../src/events/Client/interactionCreate").run(client, {
    type: 2, commandName: "restart", guildId, guild: { id: guildId }, user: { id: userId },
    channelId: "channel", reply: async (body) => body,
  });
  assert.match(response.content, /bot owners/);
  assert.equal(executed, false);
});

test("ordinary members cannot reset the player with autofix", async () => {
  let destroyed = false;
  const player = { destroy: async () => { destroyed = true; } };
  const response = await require("../src/commands/Utility/autofix").execute({
    author: { id: userId }, member: { permissions: { has: () => false } },
    guild: { id: guildId }, reply: async (body) => body,
  }, [], { config: { ownerID: [] }, manager: { players: new Map([[guildId, player]]) } });
  assert.match(response.content, /Manage Server/);
  assert.equal(destroyed, false);
});

test("24/7 recovery preserves another worker's settings and unavailable channels", async () => {
  const model = require("../src/schema/247"); const original = model.find;
  let deleted = 0; let filter;
  model.find = async (query) => { filter = query; return [guildId, otherGuildId].map((id) => ({ Guild: id, TextId: "missing", VoiceId: "missing", deleteOne: async () => { deleted++; } })); };
  try {
    await require("../src/events/Node/ready").run({
      logger: { log() {} }, guilds: { cache: new Map([[guildId, {}]]) }, channels: { cache: new Map() },
    }, "test-node");
    assert.deepEqual(filter, { Guild: { $in: [guildId] } });
    assert.equal(deleted, 0);
  } finally { model.find = original; }
});

test("expired Discord tokens refresh once across concurrent requests", async () => {
  const { refreshDiscordToken } = await loadEsm("dashboard/src/lib/discordToken.js");
  let calls = 0;
  const request = async () => { calls++; return { ok: true, json: async () => ({ access_token: "new-access", refresh_token: "rotated", expires_in: 3600 }) }; };
  const token = { id: userId, refreshToken: "unique-refresh-test" };
  const results = await Promise.all([1, 2].map(() => refreshDiscordToken(token, { clientId: "id", clientSecret: "secret" }, request)));
  assert.equal(calls, 1);
  assert.ok(results.every((result) => result.accessToken === "new-access" && result.refreshToken === "rotated"));
  assert.equal((await refreshDiscordToken({}, {}, request)).error, "RefreshAccessTokenError");
});

module.exports = { loadEsm };
