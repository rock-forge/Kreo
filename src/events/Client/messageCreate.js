const {
  PermissionsBitField,
  WebhookClient,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");
const PrefixSchema = require("../../schema/prefix.js");
const BlacklistSchema = require("../../schema/blacklist");
const IgnoreChannelModel = require("../../schema/ignorechannel");
const NoPrefixSchema = require("../../schema/noprefix");
const { checkCommandCooldown } = require("../../utils/commandAccess");

module.exports = {
  name: "messageCreate",
  once: false,
  run: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const mentionPrefix = message.content.match(new RegExp(`^<@!?${client.user.id}>`))?.[0];
    const candidatePrefix = mentionPrefix || (message.content.startsWith(client.prefix) ? client.prefix : null);
    const candidateName = candidatePrefix
      ? message.content.slice(candidatePrefix.length).trim().split(/ +/, 1)[0]?.toLowerCase()
      : null;
    const precheckBlacklist = Boolean(candidateName && (client.commands.has(candidateName) || client.aliases.has(candidateName)));

    const [prefixData, isIgnored, precheckedBlacklist] = await Promise.all([
      PrefixSchema.findOne({ Guild: message.guild.id }, { Prefix: 1, _id: 0 }).lean(),
      IgnoreChannelModel.findOne({
        guildId: message.guild.id,
        channelId: message.channel.id
      }).lean(),
      precheckBlacklist ? BlacklistSchema.findOne({ userId: message.author.id }).lean() : Promise.resolve(null),
    ]);

    if (isIgnored) {
      return;
    }

    const savedPrefix = prefixData ? prefixData.Prefix : null;
    const prefix = savedPrefix || client.prefix;

    const mention = new RegExp(`^<@!?${client.user.id}>( |)$`);
    if (message.content.match(mention)) {
      if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessages) || !message.guild.members.me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
        return;
      }

      const greetDisplay = new TextDisplayBuilder()
        .setContent(
          `**${client.emoji.check} Hey ${message.author}!**\n` +
          `**${client.emoji.info} My prefix for this server is  **\`${prefix}\`\n\n` +
          `**${client.emoji.info} Type \`${prefix}help\` for a list of commands.**`
        );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(greetDisplay);

      await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      return;
    }

    let usedPrefix = '';
    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
    } else if (message.content.match(new RegExp(`^<@!?${client.user.id}>`))) {
      usedPrefix = message.content.match(new RegExp(`^<@!?${client.user.id}>`))[0];
    } else {
      const hasNoPrefix = await NoPrefixSchema.findOne({
        userId: message.author.id,
        guildId: "GLOBAL",
        noprefix: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: Date.now() } }
        ]
      }).lean();

      if (!hasNoPrefix) {
        return;
      }
    }

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const resolvedCommandName = client.commands.has(commandName) ? commandName : client.aliases.get(commandName);
    const command = client.commands.get(resolvedCommandName);

    if (!command) return;

    const isBlacklisted = precheckBlacklist
      ? precheckedBlacklist
      : await BlacklistSchema.findOne({ userId: message.author.id }).lean();
    if (isBlacklisted) {
      const blacklistDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You have been blacklisted from using the bot!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(blacklistDisplay);

      const reply = await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => { }), 5000);
      return;
    }

    const wait = checkCommandCooldown(message.author.id, command);
    if (wait) {
      return message.reply({ content: 'Please wait ' + wait + 's before using this command again.' });
    }

    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessages) || !message.guild.members.me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
      return;
    }

    if (command.args && !args.length) {
      let reply = `You didn't provide any arguments, ${message.author}!`;
      if (command.usage) {
        reply += `\nUsage: \`${prefix}${command.name} ${command.usage}\``;
      }

      const argsDisplay = new TextDisplayBuilder()
        .setContent(reply);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(argsDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.botPerms) {
      if (!message.guild.members.me.permissions.has(PermissionsBitField.resolve(command.botPerms || []))) {
        return;
      }
    }

    if (command.userPerms) {
      if (!message.member.permissions.has(PermissionsBitField.resolve(command.userPerms || []))) {
        const permDisplay = new TextDisplayBuilder()
          .setContent(`You need the **\`${command.userPerms.join(', ')}\`** permission(s) to use this command.`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(permDisplay);

        return message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => null);
      }
    }

    if (command.owner && !client.config.ownerID.includes(message.author.id)) {
      return;
    }

    const player = client.manager.players.get(message.guild.id);
    if (command.player && !player) {
      const playerDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} There is no music player active in this server.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(playerDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.inVoiceChannel && !message.member.voice.channel) {
      const vcDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You must be in a voice channel to use this command.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(vcDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.sameVoiceChannel && player && message.member.voice.channel.id !== player.voiceId) {
      const sameVcDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You must be in the same voice channel as me.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(sameVcDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    try {
      await command.execute(message, args, client, prefix);

      if (client.config.Webhooks?.cmdrun && client.config.Webhooks.cmdrun.startsWith("https://discord.com/api/webhooks/")) {
        const web = new WebhookClient({ url: client.config.Webhooks.cmdrun });

        const commandlog = new EmbedBuilder()
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setColor(client.color)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setDescription(
            `**${client.emoji.dot} Command Used In:** \`${message.guild.name} | ${message.guild.id}\`\n` +
            `**${client.emoji.dot} Channel:** \`${message.channel.name} | ${message.channel.id}\`\n` +
            `**${client.emoji.dot} Command:** \`${command.name}\`\n` +
            `**${client.emoji.dot} Executor:** \`${message.author.tag} | ${message.author.id}\`\n` +
            `**${client.emoji.dot} Content:** \`${message.content}\``
          );

        web.send({ embeds: [commandlog] }).catch((e) => client.logger.log(e, "error"));
      }
    } catch (error) {
      client.logger.log(`Error executing command ${command.name}: ${error.stack}`, "error");

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} An error occurred while executing this command!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      try {
        await message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (sendError) {
        client.logger.log(`Failed to send error message: ${sendError}`, "error");
      }
    }
  },
};
