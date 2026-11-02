const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const clientEventsPath = path.join(__dirname, "../events/Client");
  let totalEvents = 0;

  fs.readdirSync(clientEventsPath).forEach((file) => {
    const event = require(path.join(clientEventsPath, file));
    if (!event?.name || typeof event.run !== "function") {
      client.logger.log(`Skipping invalid client event module: ${file}`, "warn");
      return;
    }

    const method = event.once ? "once" : "on";
    client[method](event.name, (...args) => event.run(client, ...args));
    totalEvents++;
  });

  client.logger.log(`Client Events Loaded: ${totalEvents}`, "event");
};
