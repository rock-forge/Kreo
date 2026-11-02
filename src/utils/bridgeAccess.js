const Blacklist = require("../schema/blacklist");

async function getPlaybackMember(client, guildId, userId, player = null) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { status: "GUILD_NOT_FOUND" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || member.user.bot) return { status: "FORBIDDEN" };
  if (await Blacklist.findOne({ userId }).lean()) return { status: "FORBIDDEN" };
  if (!member.voice.channel) return { status: "NO_VOICE_CHANNEL" };
  if (player && member.voice.channel.id !== player.voiceId) return { status: "DIFFERENT_VOICE_CHANNEL" };
  return { guild, member, status: "OK" };
}

module.exports = { getPlaybackMember };
