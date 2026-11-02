const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ButtonStyle, ComponentType, MessageFlags } = require("discord.js");

const source = fs.readFileSync(path.join(__dirname, "../src/events/Client/guildCreate.js"), "utf8");

function fixture(support, { rejectDm = false, noOwner = false } = {}) {
  const sent = [], logs = [], errors = [];
  const context = vm.createContext({
    module: { exports: {} }, URL,
    console: { log: (...args) => logs.push(args), error: (...args) => errors.push(args) },
    require(name) {
      if (name === "../../config.js") return { Webhooks: { guild_join: "" }, links: { support } };
      return require(name);
    },
  });
  vm.runInContext(source, context);
  const owner = { id: "688715932247261234", user: { username: "Owner", async send(payload) {
    // Serialize the real Discord builders, including their URL/action-row validation.
    sent.push({ flags: payload.flags, components: payload.components.map(component => component.toJSON()) });
    if (rejectDm) throw new Error("Cannot send messages to this user");
  } } };
  const guild = {
    id: "1421686119338213548", name: "A music room", memberCount: 3, createdAt: new Date("2020-01-01"),
    iconURL: () => null, fetchOwner: async () => noOwner ? null : owner,
  };
  const client = { color: "#3F4652", emoji: { check: "✅", dot: "•" }, guilds: { cache: new Map([[guild.id, guild]]) },
    user: { username: "Kreo", displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png" } };
  return { run: () => context.module.exports.run(client, guild), sent, logs, errors };
}

function descendants(components) {
  return components.flatMap(component => [component, ...descendants(component.components || [])]);
}

test("blank optional support links still produce a valid welcome without empty buttons or rows", async () => {
  for (const support of ["", "   ", undefined, null]) {
    const f = fixture(support); await f.run();
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].flags, MessageFlags.IsComponentsV2);
    const all = descendants(f.sent[0].components);
    assert.equal(all.filter(component => component.type === ComponentType.Button).length, 0);
    assert.equal(all.filter(component => component.type === ComponentType.ActionRow).length, 0);
    assert.ok(all.some(component => component.content?.includes("successfully added")));
    assert.ok(all.some(component => component.content?.includes("help command")));
    assert.ok(!all.some(component => component.content?.includes("]()")));
    assert.deepEqual(f.errors, []);
  }
});

test("malformed, unsafe-scheme and credential-bearing support URLs are omitted", async () => {
  for (const support of ["not-a-url", "discord.gg/test", "javascript:alert(1)", "ftp://example.test/file", "https://user:password@example.test/"]) {
    const f = fixture(support); await f.run();
    assert.equal(f.sent.length, 1);
    const all = descendants(f.sent[0].components);
    assert.ok(!all.some(component => component.type === ComponentType.Button));
    assert.ok(!all.some(component => component.content?.includes(support)));
    assert.deepEqual(f.errors, []);
  }
});

test("valid optional support URLs retain the existing link button and support text", async () => {
  for (const [input, expected] of [["https://discord.gg/kreo", "https://discord.gg/kreo"], ["  https://example.test/support  ", "https://example.test/support"], ["http://localhost/support", "http://localhost/support"]]) {
    const f = fixture(input); await f.run();
    const all = descendants(f.sent[0].components);
    const rows = all.filter(component => component.type === ComponentType.ActionRow);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].components.length, 1);
    const button = rows[0].components[0];
    assert.equal(button.type, ComponentType.Button);
    assert.equal(button.style, ButtonStyle.Link);
    assert.equal(button.label, "Support Server");
    assert.equal(button.url, expected);
    assert.ok(all.some(component => component.content?.includes(`**[Support Server](${expected})**`)));
    assert.deepEqual(f.errors, []);
  }
});

test("closed DMs and an unavailable guild owner do not reject guild-create processing", async () => {
  const closed = fixture("", { rejectDm: true }); await closed.run();
  assert.equal(closed.sent.length, 1);
  assert.ok(closed.logs[0][0].includes("Cannot send messages to this user"));
  assert.deepEqual(closed.errors, []);
  const unavailable = fixture("https://discord.gg/kreo", { noOwner: true }); await unavailable.run();
  assert.equal(unavailable.sent.length, 0);
  assert.deepEqual(unavailable.errors, []);
});
