module.exports = {
  name: "playerEmpty",
  run: async (client, player) => {
    console.log(`Queue empty in guild: ${player.guildId}`);
    try {
      if (client.cluster) {
        client.cluster.send({
          type: "DASHBOARD_EVENT",
          event: "queueEmpty",
          data: { guildId: player.guildId }
        }).catch(() => {});
      }

      // Clear voice status when queue is empty
      client.voiceHealthMonitor?.clearVoiceState(player);
      
      const { attemptAutoplay } = require("../../utils/playerUtils");
      await attemptAutoplay(client, player);
    } catch (e) {
      client.logger?.log(`[Autoplay] playerEmpty hook error: ${e.message}`, "error");
    }
  },
};
