const Dokdo = require("dokdo");
const { Events } = require("discord.js");

module.exports = function createDebugClient(client, options) {
  // Dokdo 1.x still registers this deprecated event. Move only its own listeners.
  const existing = new Set(client.rawListeners("ready"));
  const debug = new Dokdo.Client(client, options);
  for (const listener of client.rawListeners("ready")) {
    if (existing.has(listener)) continue;
    client.removeListener("ready", listener);
    client.once(Events.ClientReady, listener.listener || listener);
  }
  return debug;
};
