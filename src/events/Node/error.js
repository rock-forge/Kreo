const lastErrorTime = new Map();
const ERROR_THROTTLE_MS = 60000;
const { recoverLavalinkSession } = require("../../utils/lavalinkSessionRecovery");

module.exports = {
  name: "error",
  run: async (client, name, error) => {
    if (recoverLavalinkSession(client, error, name)) return;
    const errorKey = `${name}_${error.code || error.message}`;
    const now = Date.now();
    const lastTime = lastErrorTime.get(errorKey) || 0;

    if (error.code === 'ETIMEDOUT' || error.message?.includes('ETIMEDOUT')) {
      if (now - lastTime < ERROR_THROTTLE_MS) {
        return;
      }
      lastErrorTime.set(errorKey, now);
      client.logger.log(`Lavalink "${name}" connection timeout (will retry automatically)`, "warn");
      return;
    }

    client.logger.log(`Lavalink "${name}" error ${error}`, "error");

  },
};
