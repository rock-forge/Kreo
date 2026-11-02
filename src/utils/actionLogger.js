const {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const Logs = require("../schema/logs");

function formatSource(source) {
  const normalizedSource = String(source || "bot_commands").toLowerCase();

  if (normalizedSource === "dashboard" || normalizedSource === "dashboard_playlist") {
    return "Dashboard";
  }

  if (normalizedSource === "bot_controls") {
    return "Bot Controls";
  }

  if (normalizedSource === "system") {
    return "System";
  }

  return "Bot Commands";
}

function formatActor(user, client) {
  if (user?.username && user?.id) {
    return `${user.username} (\`${user.id}\`)`;
  }

  if (user?.tag && user?.id) {
    return `${user.tag} (\`${user.id}\`)`;
  }

  if (client?.user?.username && client?.user?.id) {
    return `${client.user.username} (\`${client.user.id}\`)`;
  }

  return "Unknown User";
}

async function sendActionLog(client, guild, user, action, track = null, options = {}) {
  try {
    const logData = await Logs.findOne({ Guild: guild.id });
    if (!logData?.Channel) {
      return;
    }

    const channel = guild.channels.cache.get(logData.Channel);
    if (!channel) {
      return;
    }

    const details = [
      `**User:** ${formatActor(user, client)}`,
      `**Action:** ${action}`,
      `**Source:** ${formatSource(options.source)}`,
    ];

    if (track?.title) {
      details.push(`**Track:** ${track.uri ? `[${track.title}](${track.uri})` : track.title}`);
    }

    const summary = new TextDisplayBuilder().setContent("### Action Logs");
    const body = new TextDisplayBuilder().setContent(details.join("\n"));

    const container = new ContainerBuilder();
    if (track?.thumbnail) {
      const section = new SectionBuilder().addTextDisplayComponents(summary, body);
      section.setThumbnailAccessory((thumbnail) => thumbnail.setURL(track.thumbnail));
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(summary, body);
    }
    container.addSeparatorComponents(new SeparatorBuilder());

    await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Error sending action log:", error);
  }
}

module.exports = sendActionLog;
