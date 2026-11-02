const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture({ content = ".ping", prefix = ".", blocked = false, gate } = {}) {
  let blacklistQueries = 0, executed = 0, warnings = 0;
  const context = { module: { exports: {} }, console, require(name) {
    if (name.includes("schema/prefix")) return { findOne: () => ({ lean: async () => { if (gate) await gate; return { Prefix: prefix }; } }) };
    if (name.includes("schema/blacklist")) return { findOne: () => { blacklistQueries++; return { lean: async () => blocked ? { userId: "member" } : null }; } };
    if (name.includes("schema/ignorechannel") || name.includes("schema/noprefix")) return { findOne: () => ({ lean: async () => null }) };
    if (name.includes("utils/commandAccess")) return { checkCommandCooldown: () => 0 };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/events/Client/messageCreate.js"), "utf8"), context);
  const client = { prefix: ".", user: { id: "123456789012345678" }, commands: new Map([["ping", { name: "ping", execute: async () => { executed++; } }]]),
    aliases: new Map([["pong", "ping"]]), manager: { players: new Map() }, config: {}, emoji: { warn: "⚠️" } };
  const message = { content, author: { id: "member", bot: false },
    guild: { id: "guild", members: { me: { permissions: { has: () => true } } } },
    channel: { id: "channel", send: async () => { warnings++; return null; } },
  };
  return { run: () => context.module.exports.run(client, message), counts: () => ({ blacklistQueries, executed, warnings }) };
}

test("known default-prefix commands check the blacklist before the prefix lookup finishes", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const command = fixture({ gate });
  const running = command.run();
  assert.equal(command.counts().blacklistQueries, 1);
  assert.equal(command.counts().executed, 0);
  release(); await running;
  assert.equal(command.counts().executed, 1);
  assert.equal(command.counts().blacklistQueries, 1);
});

test("parallel dispatch still rejects blocked default, alias and custom-prefix commands", async () => {
  for (const [content, prefix] of [[".ping", "."], [".pong", "."], ["!ping", "!"]]) {
    const command = fixture({ content, prefix, blocked: true }); await command.run();
    assert.deepEqual(command.counts(), { blacklistQueries: 1, executed: 0, warnings: 1 });
  }
});

test("ordinary messages do not add blacklist queries and a changed prefix is respected", async () => {
  const ordinary = fixture({ content: "hello everyone" }); await ordinary.run();
  assert.equal(ordinary.counts().blacklistQueries, 0);
  const oldPrefix = fixture({ content: ".ping", prefix: "!" }); await oldPrefix.run();
  assert.equal(oldPrefix.counts().executed, 0);
});
