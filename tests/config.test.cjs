const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadConfig(env) {
  const context = { module: { exports: {} }, __dirname: path.join(__dirname, "../src"), process: { env },
    URL, require: (name) => name === "dotenv" ? { config() {} } : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/config.js"), "utf8"), context);
  return context.module.exports;
}

test("the supplied bot environment aliases work without dashboard OAuth credentials", () => {
  const config = loadConfig({ BOT_TOKEN: "test-token", MONGODB_URL: "mongodb://localhost/test",
    OWNER_IDS: "owner", BOT_PREFIX: ".", BOT_COLOR: "#3F4652", LAVALINK_NAME: "Test Node",
    LAVALINK_URL: "localhost:2333", LAVALINK_PASSWORD: "test-password", LAVALINK_SECURE: "false", LAVALINK_SOURCE: "ytmsearch",
    DASHBOARD_BRIDGE_SECRET: "independent-local-bridge-secret",
  });
  assert.equal(config.token, "test-token");
  assert.equal(config.mongourl, "mongodb://localhost/test");
  assert.equal(config.prefix, ".");
  assert.equal(config.color, "#3F4652");
  assert.equal(config.nodes[0].secure, false);
  assert.equal(config.nodes[0].auth, "test-password");
  assert.equal(config.node_source, "ytmsearch");
  assert.equal(config.dashboard.bridgeSecret, "independent-local-bridge-secret");
  assert.equal(config.node_options.restTimeout, 60);
  assert.equal(config.node_options.voiceConnectionTimeout, 30);
});

test("the canonical bot variable names remain supported", () => {
  const config = loadConfig({ DISCORD_TOKEN: "canonical-token", MONGO_URI: "mongodb://localhost/canonical",
    DISCORD_CLIENT_ID: "test-client", DISCORD_CLIENT_SECRET: "test-secret", LAVALINK_SECURE: "true" });
  assert.equal(config.token, "canonical-token");
  assert.equal(config.mongourl, "mongodb://localhost/canonical");
  assert.equal(config.nodes[0].secure, true);
  assert.match(config.dashboard.bridgeSecret, /^[a-f0-9]{64}$/);
});

test("command registration preserves an app's activity entry point and context menus", () => {
  const { mergeApplicationCommands } = require("../src/utils/registerApplicationCommands");
  const existing = [
    { id: "old-slash", name: "old", type: 1 },
    { id: "activity", name: "launch", type: 4, handler: 2, description: "Launch an activity", application_id: "private-metadata", contexts: [0, 1, 2] },
    { id: "context", name: "Inspect member", type: 2 },
  ];
  const merged = mergeApplicationCommands([{ name: "restart", description: "Configure verification" }], existing);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].id, "activity");
  assert.equal(merged[1].handler, 2);
  assert.deepEqual(merged[1].contexts, [0, 1, 2]);
  assert.equal(merged[1].application_id, undefined);
  assert.equal(merged[2].type, 2);
  assert.throws(() => mergeApplicationCommands([], null));
});
