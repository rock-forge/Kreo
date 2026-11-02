const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");
const { isBotOwner } = require("../../utils/commandAccess");

module.exports = {
  name: "autofix",
  category: "Utility",
  description: "Forcefully clears the music player and voice connection if the bot is stuck.",
  cooldown: 10,
  botPerms: ["EmbedLinks"],
  userPerms: ["ManageGuild"],
  
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      reply: async (options) => {
        if (interaction.deferred) {
          return await interaction.editReply(options);
        } else if (interaction.replied) {
          return await interaction.followUp(options);
        } else {
          return await interaction.reply(options);
        }
      },
    };
    return this.execute(interactionWrapper, [], client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    if (!isBotOwner(client, message.author.id) && !message.member?.permissions?.has("ManageGuild")) {
      return message.reply({ content: "You need Manage Server permission to reset the music player." });
    }
    try {
      const guild = message.guild;
      let actionTaken = false;

      // 1. Check and destroy lavalink player
      const player = client.manager.players.get(guild.id);
      if (player) {
        try {
          await player.destroy();
          actionTaken = true;
        } catch (e) {
          console.error(`Autofix: Error destroying player for ${guild.id}:`, e);
        }
        client.manager.players.delete(guild.id);
      }

      // 2. Stop voice health monitor
      if (client.voiceHealthMonitor) {
        client.voiceHealthMonitor.stopMonitoring(guild.id);
      }

      // 3. Force disconnect from Discord Voice directly
      const botMember = guild.members.me;
      if (botMember && botMember.voice.channelId) {
        try {
          botMember.voice.disconnect();
          actionTaken = true;
        } catch (e) {
          console.error(`Autofix: Error disconnecting voice for ${guild.id}:`, e);
        }
      }

      if (actionTaken) {
        const successDisplay = new TextDisplayBuilder()
          .setContent(`### 🔧 **Autofix Complete!**\n> The bot's voice state and player have been forcefully reset.\n> You should now be able to use \`/play\` normally.`);
        
        const container = new ContainerBuilder()
          .addTextDisplayComponents(successDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } else {
        const infoDisplay = new TextDisplayBuilder()
          .setContent(`### ${client.emoji.info || 'ℹ️'} **Nothing to Fix**\n> The bot is not currently connected to any voice channel or player.`);
        
        const container = new ContainerBuilder()
          .addTextDisplayComponents(infoDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

    } catch (error) {
      console.error("Autofix Error:", error);
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`### ${client.emoji.cross || '❌'} **Autofix Failed**\n> An unexpected error occurred while trying to clear the connection.`);
      
      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }
  }
};
