const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");
const sendActionLog = require("../../utils/actionLogger");
const Wait = require("util").promisify(setTimeout);
const emoji = require("../../emojis");

module.exports = {
  name: "stop",
  category: "Music",
  cooldown: 3,
  description: "Stops the music",
  args: false,
  usage: "",
  botPerms: ["EmbedLinks"],
  dj: true,
  owner: false,
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
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

    const args = [];
    if (interaction.options) {
      const options = interaction.options.data;
      for (const option of options) {
        if (option.value !== undefined) {
          args.push(option.value.toString());
        }
      }
    }

    const prefix = client.prefix;
    return this.execute(interactionWrapper, args, client, prefix);
  },

  async execute(message, args, client, prefix) {
    const player = client.manager.players.get(message.guild.id);

    if (!player.queue.current) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Play a song first!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    player.data.set("autoplay", false);
    player.queue.clear();
    player.loop = "none";
    try {
      await Promise.resolve(player.pause(false));
    } catch {}
    
    // Clear voice status immediately
    client.voiceHealthMonitor?.clearVoiceState(player);

    const { emitDashboardPlayerState } = require("../../events/Players/playerStart");
    emitDashboardPlayerState(client, player, { paused: false, playing: false });

    await player.skip();
    await Wait(500);

    const successDisplay = new TextDisplayBuilder()
      .setContent(`**${client.emoji.check} Stopped the music**`);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(successDisplay);

    await sendActionLog(client, message.guild, message.author, "Stopped music");

    message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  },
};
