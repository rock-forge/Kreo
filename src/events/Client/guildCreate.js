const {
  WebhookClient,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  AuditLogEvent
} = require("discord.js");
const config = require("../../config.js");
const {
  Webhooks: { guild_join },
  links: { support }
} = config;

const moment = require("moment");

function optionalWebUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

module.exports = {
  name: "guildCreate",
  run: async (client, guild) => {
    const isWebhookValid = guild_join && guild_join.startsWith("https://discord.com/api/webhooks/");
    const web = isWebhookValid ? new WebhookClient({ url: guild_join }) : null;
    const own = await guild.fetchOwner().catch(() => null);

    const vanity = guild.vanityURLCode
      ? `[Here is ${guild.name} invite](https://discord.gg/${guild.vanityURLCode})`
      : `No vanity URL`;

    const embed = new EmbedBuilder()
      .setColor(client.color)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .setDescription(
        `**${client.emoji.check} Joined a Guild**\n\n` +
        `**${client.emoji.dot} Server Name:** \`${guild.name}\` \n` +
        `**${client.emoji.dot} Server ID:** \`${guild.id}\` \n` +
        `**${client.emoji.dot} Server Owner:** \`${own?.user?.username || "Unknown"}\` (${own?.id || "N/A"}) \n` +
        `**${client.emoji.dot} Member Count:** \`${guild.memberCount}\` Members \n` +
        `**${client.emoji.dot} Creation Date:** \`${moment.utc(guild.createdAt).format("DD/MMM/YYYY")}\` \n` +
        `**${client.emoji.dot} Guild Invite:** ${vanity} \n` +
        `**${client.emoji.dot} Total Servers:** \`${client.guilds.cache.size}\``
      )
      .setFooter({
        text: `Total Server Count [ ${client.guilds.cache.size} ]`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();
  
    if (web) web.send({ embeds: [embed] }).catch(() => { });

    try {
      if (own && own.user) {
        const recipient = own.user;
        const supportUrl = optionalWebUrl(support);

        const welcomeHeader = new TextDisplayBuilder()
          .setContent(`### ${client.emoji.check} Thank you for choosing ${client.user.username}!`);

        const separator1 = new SeparatorBuilder();

        const infoDisplay = new TextDisplayBuilder()
          .setContent(
            `${client.user.username} has been successfully added to \`${guild.name}\`\n\n` +
            (supportUrl
              ? `You can report any issues at my **[Support Server](${supportUrl})** following the needed steps. You can also reach out to my **[Developers](${supportUrl})** if you want to know more about me.`
              : "Use the help command to explore my music commands and features.")
          );

        const container = new ContainerBuilder()
          .addTextDisplayComponents(welcomeHeader)
          .addSeparatorComponents(separator1)
          .addTextDisplayComponents(infoDisplay);

        if (supportUrl) {
          const supportButton = new ButtonBuilder()
            .setLabel('Support Server')
            .setStyle(ButtonStyle.Link)
            .setURL(supportUrl);
          const buttonRow = new ActionRowBuilder().addComponents(supportButton);
          container.addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(buttonRow);
        }

        await recipient.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        }).catch((err) => {
          console.log(`Could not send welcome DM to ${recipient.username}: ${err.message}`);
        });
      }
    } catch (error) {
      console.error('Error sending welcome DM:', error);
    }
  },
};
