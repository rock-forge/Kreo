const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const playersPath = path.join(__dirname, "../events/Players");
  let totalEvents = 0;

  if (fs.existsSync(playersPath)) {
    fs.readdirSync(playersPath).forEach((file) => {
      const event = require(path.join(playersPath, file));
      if (!event?.name || typeof event.run !== "function") {
        client.logger.log(`Skipping invalid player event module: ${file}`, "warn");
        return;
      }

      const method = event.once ? "once" : "on";
      client.manager[method](event.name, (...args) => event.run(client, ...args));
      totalEvents++;
    });
  }

  client.logger.log(`Player Events Loaded: ${totalEvents}`, "event");
};
