const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client, Collection, Events, ComponentType, MessageFlags } = require("discord.js");
const help = require("../src/utils/helpMenu");
const { applyApplicationEmojis } = require("../src/utils/applicationEmojis");
const owner = "688715932247261234", member = "123456789012345678";

function fixture() {
  const client = {
    commands: new Collection(), slashCommands: new Collection(), aliases: new Collection(),
    logger: { log() {} }, config: { ownerID: [owner], dashboard: { nextAuthUrl: "https://music.zenithh.online" }, links: {} },
    emoji: { ...require("../src/emojis") }, prefix: ".",
    user: { username: "Kreo Mnax", displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png" },
  };
  require("../src/loaders/loadCommands")(client);
  return client;
}
function nodes(payload) {
  const result = [];
  function walk(item) {
    result.push(item);
    for (const child of item.components || []) walk(child);
    if (item.accessory) walk(item.accessory);
  }
  payload.components.map(c => c.toJSON()).forEach(walk);
  return result;
}
function selectId(payload) { return nodes(payload).find(node => node.type === ComponentType.StringSelect).custom_id; }

test("application emojis prefer the current purple set and preserve legacy key aliases", () => {
  const target = { check: "✅", load: "⏳", shuffle: "🔀", suffle: "🔀", info: "ℹ️" };
  applyApplicationEmojis(target, [
    { name: "sb_check", id: "1546515896732754031" },
    { name: "km_purple2_check", id: "1546795892240285788" },
    { name: "km_purple2_loading", id: "1546795896929259610", animated: true },
    { name: "km_purple2_shuffle", id: "1546795904097452057" },
  ]);
  assert.equal(target.check, "<:km_purple2_check:1546795892240285788>");
  assert.equal(target.load, "<a:km_purple2_loading:1546795896929259610>");
  assert.equal(target.suffle, target.shuffle);
  assert.equal(target.info, "ℹ️");
});

test("only owners see owner tools; every command page fits Discord's component limits", () => {
  const client = fixture();
  for (const userId of [owner, member]) {
    const home = help.buildHelpMenu(client, userId, ".");
    const select = nodes(home).find(node => node.type === ComponentType.StringSelect);
    assert.equal(select.options.some(option => option.value === "Owner"), userId === owner);
    assert.equal(nodes(home).some(node => node.type === ComponentType.MediaGallery), false);
    assert.equal(JSON.stringify(home).includes("Owner access enabled"), userId === owner);
    for (const category of help.categoriesFor(client, userId)) {
      for (let page = 0; page < Math.ceil(category.commands.length / 8); page++) {
        const payload = help.buildHelpMenu(client, userId, ".", { category: category.key, page });
        const all = nodes(payload);
        assert.ok(all.length <= 40);
        assert.ok(all.filter(node => node.type === ComponentType.TextDisplay).reduce((sum, node) => sum + node.content.length, 0) <= 4000);
        assert.ok(all.filter(node => node.custom_id).every(node => node.custom_id.length <= 100));
      }
    }
  }
});

test("command details resolve aliases and do not disclose owner-only commands", async () => {
  const client = fixture(); let response;
  const message = { author: { id: member }, reply: async payload => { response = payload; } };
  await help.execute(message, ["h"], client, "!");
  assert.match(JSON.stringify(response), /!help/);
  await help.execute(message, ["restart"], client, ".");
  assert.match(JSON.stringify(response), /Command not found/);
  assert.doesNotMatch(JSON.stringify(response), /Subcommands/);
});

test("help navigation rejects other users, expired menus and forged owner categories", async () => {
  const client = fixture();
  let reply;
  const makeInteraction = customId => ({ customId, user: { id: member }, values: ["Owner"], reply: async value => { reply = value; } });
  await help.componentsV2(makeInteraction(selectId(help.buildHelpMenu(client, owner, "."))), client);
  assert.match(reply.content, /someone else/);
  assert.equal(reply.flags, MessageFlags.Ephemeral);
  await help.componentsV2(makeInteraction(selectId(help.buildHelpMenu(client, member, ".", { expiresAt: Date.now() - 1000 }))), client);
  assert.match(reply.content, /expired/);
  await help.componentsV2(makeInteraction(selectId(help.buildHelpMenu(client, member, "."))), client);
  assert.match(reply.content, /not available/);
});

test("authorized help navigation survives without collectors and uses the server prefix", async () => {
  const client = fixture();
  const Prefix = require("../src/schema/prefix");
  const original = Prefix.findOne;
  let response, acknowledged = false;
  Prefix.findOne = () => ({ lean: async () => ({ Prefix: "!" }) });
  try {
    await help.componentsV2({
      customId: selectId(help.buildHelpMenu(client, owner, ".")), values: ["Owner"],
      user: { id: owner }, guildId: "987654321098765432",
      deferUpdate: async () => { acknowledged = true; }, editReply: async payload => { response = payload; },
    }, client);
    assert.equal(acknowledged, true);
    assert.match(JSON.stringify(response), /!blacklist/);
    assert.match(JSON.stringify(response), /Owner access enabled/);
  } finally { Prefix.findOne = original; }
});

test("help autocomplete filters restricted commands using the current owner list", async () => {
  const client = fixture(); let choices;
  const interaction = { user: { id: member }, options: { getFocused: () => "rest" }, respond: async value => { choices = value; } };
  await help.autocomplete(interaction, client); assert.deepEqual(choices, []);
  interaction.user.id = owner;
  await help.autocomplete(interaction, client); assert.ok(choices.some(choice => choice.value === "restart"));
});

test("Dokdo listens to clientReady without installing a deprecated ready listener", async () => {
  const client = new Client({ intents: [] });
  try {
    const debug = require("../src/utils/createDebugClient")(client, { owners: [owner], prefix: ".." });
    assert.equal(client.listenerCount("ready"), 0);
    assert.equal(client.listenerCount(Events.ClientReady), 1);
    assert.equal(client.emit("ready", client), false);
    client.emit(Events.ClientReady, client);
    assert.equal(client.listenerCount(Events.ClientReady), 0);
    assert.deepEqual(debug.owners, [owner]);
  } finally { await client.destroy(); }
});
