const Blacklist = require("../schema/blacklist");
const IgnoreChannel = require("../schema/ignorechannel");

const cooldowns = new Map();

function isBotOwner(client, userId) {
  return Array.isArray(client.config?.ownerID) && client.config.ownerID.includes(userId);
}

async function getCommandRestriction(client, { command, userId, guildId, channelId }) {
  if (!guildId) return "Use this command in a server.";
  if (command?.owner && !isBotOwner(client, userId)) return "Only the bot owners can use this command.";
  const [blocked, ignored] = await Promise.all([
    Blacklist.findOne({ userId }).lean(),
    IgnoreChannel.findOne({ guildId, channelId }).lean(),
  ]);
  if (blocked) return "You have been blacklisted from using the bot.";
  if (ignored) return "Bot commands are disabled in this channel.";
  return null;
}

function checkCommandCooldown(userId, command, now = Date.now()) {
  const key = `${userId}:${command.name}`;
  const until = cooldowns.get(key) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  for (const [id, expiry] of cooldowns) if (expiry <= now) cooldowns.delete(id);
  cooldowns.set(key, now + (command.cooldown ?? 3) * 1000);
  return 0;
}

module.exports = { isBotOwner, getCommandRestriction, checkCommandCooldown };
