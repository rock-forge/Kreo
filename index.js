// Early Warning Suppression Removed (handled by node flags)
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({ connect: { timeout: 30_000 } }));

const MusicBot = require("./src/structures/MusicClient");
const createDebugClient = require("./src/utils/createDebugClient");
const Logger = require("./src/utils/logger");
const { recoverLavalinkSession } = require("./src/utils/lavalinkSessionRecovery");

const client = new MusicBot();
module.exports = client;

client.connect().catch((error) => {
  Logger.log(`Bot startup failed: ${error.message}`, "error");
  process.exitCode = 1;
  client.destroy();
  require("mongoose").disconnect().catch(() => {});
});

client.Jsk = createDebugClient(client, {
  aliases: ["dokdo", "dok", "jsk"],
  prefix: "..",
  owners: client.config.ownerID,
});

process.env.SHELL = process.platform === "win32" ? "powershell" : "bash";

const emojis = require("./src/emojis");
client.emoji = emojis;

client.on("messageCreate", (message) => {
  client.Jsk.run(message);
});

// Improved Error Handling with Logger
process.on("unhandledRejection", (reason, p) => {
  if (recoverLavalinkSession(client, reason)) return;
  // Filter known Lavalink/Undici timeouts to avoid log spam
  if (reason && (reason.code === 'UND_ERR_CONNECT_TIMEOUT' || (reason.message && reason.message.includes('fetch failed')))) {
    Logger.log("[Lavalink Error] Connection timeout or fetch failed. Node might be down.", "warn");
    return;
  }

  Logger.log(`[Unhandled Rejection] Reason: ${reason}`, "error");
  console.error(reason, p); // Keep console.error for stack trace details

});

process.on("uncaughtException", (err, origin) => {
  Logger.log(`[Uncaught Exception] ${err}`, "error");
  console.error(origin, err);
});

process.on("uncaughtExceptionMonitor", (err, origin) => {
  Logger.log(`[Uncaught Exception Monitor] ${err}`, "error");
  console.error(origin, err);
});
