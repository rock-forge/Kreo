const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  name: "ping",
  category: "Information",
  description: "Show bot latency and connection health.",
  aliases: ["latency", "pong"],
  cooldown: 3,
  args: false,
  usage: "",
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
          return interaction.editReply(options);
        }
        if (interaction.replied) {
          return interaction.followUp(options);
        }
        return interaction.reply(options);
      },
    };

    return this.execute(interactionWrapper, [], client, client.prefix);
  },

  async execute(message, args, client) {
    const apiLatency = Math.round(client.ws.ping);
    const uptimeMs = client.uptime || 0;
    const uptimeMinutes = Math.floor(uptimeMs / 60000);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDisplay = uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes % 60}m`
      : `${uptimeMinutes}m`;

    const content = [
      `**${client.emoji.check} Pong!**`,
      `**${client.emoji.dot} API Latency:** \`${apiLatency}ms\``,
      `**${client.emoji.dot} Uptime:** \`${uptimeDisplay}\``,
      `**${client.emoji.dot} Loaded Commands:** \`${client.commands.size}\``,
    ].join("\n");

    return message.reply({
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
