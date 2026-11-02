const dns = require("node:dns");
const mongoose = require("mongoose");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const config = require("../src/config");

dns.setDefaultResultOrder("ipv4first");

function failure(error) {
  const message = String(error?.message || "").toLowerCase();
  if (error?.code === 18 || message.includes("authentication failed") || message.includes("bad auth")) return "Authentication failed";
  if (error?.code === "TokenInvalid" || message.includes("invalid token")) return "Discord rejected the bot token";
  if (error?.code === 4014 || message.includes("disallowed intents")) return "Required Discord privileged intents are disabled";
  if (error?.name === "TimeoutError" || error?.name === "MongoServerSelectionError" || message.includes("timed out") || message.includes("timeout")) return "Connection timed out";
  if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") return error.code;
  if (error?.cause?.code === "ENOTFOUND" || error?.cause?.code === "ECONNREFUSED") return error.cause.code;
  return "Connection failed";
}

async function discord() {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${config.token}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return { service: "Discord", ok: false, httpStatus: response.status,
    reason: response.status === 401 ? "Discord rejected the bot token" : "Discord API request failed" };
  const identity = await response.json();
  const client = new Client({ intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
  ] });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Gateway timed out")), 20_000);
      client.once(Events.ClientReady, resolve);
      client.once(Events.Error, reject);
      client.login(config.token).catch(reject);
    });
    return { service: "Discord", ok: true, gatewayConnected: true, botId: identity.id, servers: client.guilds.cache.size };
  } finally { clearTimeout(timer); await client.destroy(); }
}

async function database() {
  const connection = mongoose.createConnection(config.mongourl, {
    autoIndex: false, bufferCommands: false, serverSelectionTimeoutMS: 12_000,
    connectTimeoutMS: 12_000, socketTimeoutMS: 12_000, family: 4,
  });
  connection.on("error", () => {});
  try {
    await connection.asPromise();
    await connection.db.command({ ping: 1 });
    await connection.db.collection("prefixes").findOne({ _id: "__read_only_connection_check__" }, { projection: { _id: 1 }, maxTimeMS: 5000 });
    return { service: "MongoDB", ok: true, authenticated: true, readAccess: true };
  } finally { await connection.close().catch(() => {}); }
}

async function lavalink() {
  const node = config.nodes[0];
  const base = `${node.secure ? "https" : "http"}://${node.url}`;
  const headers = { Authorization: node.auth };
  const response = await fetch(`${base}/v4/info`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return { service: "Lavalink", ok: false, httpStatus: response.status,
    reason: response.status === 401 || response.status === 403 ? "Lavalink rejected the password" : "Lavalink v4 info request failed" };
  const info = await response.json();
  const searchUrl = new URL(`${base}/v4/loadtracks`);
  searchUrl.searchParams.set("identifier", `${config.node_source}:Never Gonna Give You Up`);
  const searchResponse = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(20_000) });
  if (!searchResponse.ok) return { service: "Lavalink", ok: false, connected: true, httpStatus: searchResponse.status, reason: "Track search request failed" };
  const search = await searchResponse.json();
  const trackCount = Array.isArray(search.data) ? search.data.length : search.loadType === "track" ? 1 : search.data?.tracks?.length || 0;
  return { service: "Lavalink", ok: trackCount > 0, connected: true,
    version: String(info.version?.semver || "unknown").slice(0, 50), searchLoadType: search.loadType,
    tracksFound: trackCount, ...(!trackCount ? { reason: "The configured search source returned no playable results" } : {}) };
}

async function main() {
  const checks = await Promise.all([discord, database, lavalink].map(async (check) => {
    try { return await check(); }
    catch (error) { return { service: check === database ? "MongoDB" : check === discord ? "Discord" : "Lavalink", ok: false, reason: failure(error) }; }
  }));
  for (const result of checks) console.log(JSON.stringify(result));
  console.log(JSON.stringify({ service: "Dashboard OAuth", configured: Boolean(config.dashboard.clientId && config.dashboard.clientSecret),
    ...(!config.dashboard.clientSecret ? { missing: "DISCORD_CLIENT_SECRET" } : {}) }));
  if (checks.some((result) => !result.ok)) process.exitCode = 1;
}

main().catch(() => { console.error("Service checks could not complete."); process.exitCode = 1; });
