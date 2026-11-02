const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const dashboard = path.resolve(__dirname, "../dashboard");
const DiscordProvider = require(dashboard + "/node_modules/next-auth/providers/discord").default;
const parseProviders = require(dashboard + "/node_modules/next-auth/core/lib/providers").default;
const { openidClient } = require(dashboard + "/node_modules/next-auth/core/lib/oauth/client");
const { TokenSet } = require(dashboard + "/node_modules/openid-client");

function providerConfiguration() {
  const source = fs.readFileSync(dashboard + "/src/app/api/auth/[...nextauth]/route.js", "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export \{.*\};?\r?\n?/gm, "").replace(/export const /g, "const ");
  const options = vm.runInNewContext(source + "\n;authOptions;", {
    NextAuth: () => null, DiscordProvider, refreshDiscordToken: async value => value,
    runtimeConfig: { dashboard: { clientId: "test-client", clientSecret: "test-secret", nextAuthSecret: "test-auth-secret" } },
  });
  return parseProviders({ providers: options.providers, url: "https://music.zenithh.online/api/auth", providerId: "discord" }).provider;
}

test("Discord's issuer callback reaches token exchange and still rejects mismatched state or issuer", async () => {
  const provider = providerConfiguration();
  const client = await openidClient({ provider });
  let exchanges = 0;
  client.grant = async () => { exchanges++; return new TokenSet({ access_token: "fixture-access", token_type: "Bearer", expires_in: 3600 }); };
  const callback = { code: "fixture-code", state: "fixture-state", iss: "https://discord.com" };
  const tokens = await client.oauthCallback(provider.callbackUrl, callback, { state: "fixture-state" });
  assert.equal(tokens.access_token, "fixture-access");
  assert.equal(exchanges, 1);
  await assert.rejects(client.oauthCallback(provider.callbackUrl, { ...callback, iss: "https://attacker.invalid" }, { state: "fixture-state" }), /iss mismatch/);
  await assert.rejects(client.oauthCallback(provider.callbackUrl, { ...callback, state: "tampered-state" }, { state: "fixture-state" }), /state mismatch/);
  await assert.rejects(client.oauthCallback(provider.callbackUrl, { code: "fixture-code", iss: "https://discord.com" }, { state: "fixture-state" }), /state missing/);
  assert.equal(exchanges, 1);
});
