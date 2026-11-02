const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function managerFixture(resolver, savedVolume = 35) {
  const { LoadType, Constants } = require("shoukaku");
  let options;
  class Manager {
    constructor() { this.shoukaku = { on() {}, nodes: new Map([
      ["offline", { name: "offline", state: Constants.State.DISCONNECTED, rest: { resolve: () => { throw new Error("Offline node used"); } } }],
      ["online", { name: "online", state: Constants.State.CONNECTED, rest: { resolve: resolver } }],
    ]) }; }
    async createPlayer(input) { options = input; return { guildId: input.guildId }; }
  }
  const context = { module: { exports: {} }, console, require(name) {
    if (name === "kazagumo") return { Kazagumo: Manager, KazagumoTrack: class { constructor(raw) { this.title = raw.info.title; } } };
    if (name === "shoukaku") return { LoadType, Constants, Connectors: { DiscordJS: class {} } };
    if (name === "../schema/prefix") return { findOne: () => ({ lean: async () => ({ Volume: savedVolume }) }) };
    if (name === "../utils/lavalinkSessionRecovery") return require("../src/utils/lavalinkSessionRecovery");
    throw new Error(`Unexpected require ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/loaders/loadPlayerManager.js"), "utf8"), context);
  const client = { config: { node_source: "spsearch", nodes: [], node_options: {} }, guilds: { cache: new Map() } };
  return { manager: context.module.exports(client), options: () => options };
}

test("empty search results advance to the next engine and ignore offline nodes", async () => {
  const { LoadType } = require("shoukaku"); const attempts = [];
  const fixture = managerFixture(async (query) => {
    attempts.push(query);
    return query.startsWith("spsearch:") ? { loadType: LoadType.SEARCH, data: [] } : { loadType: LoadType.SEARCH, data: [{ info: { title: "Found" } }] };
  });
  const result = await fixture.manager.search("test song");
  assert.equal(result.tracks[0].title, "Found");
  assert.deepEqual(attempts, ["spsearch:test song", "ytmsearch:test song"]);
});

test("new players use the saved default volume and preserve explicit recovery volume", async () => {
  const fixture = managerFixture(async () => null);
  await fixture.manager.createPlayer({ guildId: "guild" }); assert.equal(fixture.options().volume, 35);
  await fixture.manager.createPlayer({ guildId: "guild", volume: 64 }); assert.equal(fixture.options().volume, 64);
});

test("node health uses Shoukaku's connection states instead of numeric guesses", async () => {
  const { State } = require("shoukaku").Constants;
  const { hasAvailableNodes, waitForNodeConnection } = require("../src/utils/nodeUtils");
  const node = { state: State.DISCONNECTING };
  const manager = { shoukaku: { nodes: new Map([["node", node]]) } };
  assert.equal(hasAvailableNodes(manager), false);
  node.state = State.CONNECTED;
  assert.equal(hasAvailableNodes(manager), true);
  assert.equal(await waitForNodeConnection(manager, 100), true);
});

test("non-track actions produce valid Discord log components", async () => {
  const Logs = require("../src/schema/logs"); const original = Logs.findOne; let sent = false;
  Logs.findOne = async () => ({ Channel: "logs" });
  try {
    await require("../src/utils/actionLogger")({ user: { id: "bot", username: "Bot" } }, {
      id: "guild", channels: { cache: new Map([["logs", { send: async (body) => {
        for (const component of body.components) component.toJSON(); sent = true;
      } }]]) },
    }, { id: "user", username: "User" }, "Cleared music queue");
    assert.equal(sent, true);
  } finally { Logs.findOne = original; }
});

test("preferences can run save middleware with Mongoose 9", async () => {
  const Model = require("../src/schema/userpreferences");
  const doc = new Model({ userId: "user" });
  await assert.doesNotReject(Model.schema.s.hooks.execPre("save", doc, []));
});

test("the owner restart command cannot be shadowed by replay aliases", () => {
  assert.equal(require("../src/commands/Music/replay").aliases.includes("restart"), false);
});

test("the blacklist command updates blacklist records instead of branding", async () => {
  const Blacklist = require("../src/schema/blacklist"); const original = Blacklist.updateOne; let target;
  Blacklist.updateOne = async (query) => { target = query.userId; };
  try {
    await require("../src/commands/Owner/blacklist").execute({ author: { id: "owner" }, reply: async () => {} },
      ["add", "333333333333333333"], { config: { ownerID: ["owner"] } });
    assert.equal(target, "333333333333333333");
  } finally { Blacklist.updateOne = original; }
});

test("disabling autoplay cancels an in-flight recommendation before it queues music", async () => {
  let release;
  const search = new Promise((resolve) => { release = resolve; });
  const queue = [];
  Object.defineProperty(queue, "size", { get() { return this.length; } });
  queue.add = (track) => queue.push(track);
  const player = { guildId: "guild", playing: false, paused: false, loop: "none", queue,
    data: new Map([["autoplay", true], ["lastTrack", { title: "Original", author: "Artist", identifier: "first" }]]),
    search: () => search, play: async () => { throw new Error("Playback should remain stopped"); },
  };
  const client = { manager: { players: new Map([["guild", player]]) } };
  const pending = require("../src/utils/playerUtils").attemptAutoplay(client, player);
  player.data.set("autoplay", false);
  release({ tracks: [{ title: "Different song", author: "Artist", identifier: "second" }] });
  await pending;
  assert.equal(queue.length, 0);
  assert.equal(player.data.has("autoplayInProgress"), false);
});
