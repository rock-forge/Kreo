const {
  CommandInteraction,
  InteractionType,
  PermissionFlagsBits,
  PermissionsBitField,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getCommandRestriction, checkCommandCooldown } = require("../../utils/commandAccess");
const db = require("../../schema/prefix.js");
const db3 = require("../../schema/setup");
const sendActionLog = require("../../utils/actionLogger");
const biosetCommandPath = path.join(__dirname, "../../commands/Profile/bioset.js");

module.exports = {
  name: "interactionCreate",
  run: async (client, interaction) => {
    if (!interaction.guildId || !interaction.guild) {
      if (interaction.isAutocomplete?.()) return interaction.respond([]).catch(() => {});
      if (interaction.isRepliable?.()) return interaction.reply({ content: "Use this command in a server.", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    let prefix = client.prefix;
    const commandForAccess = client.slashCommands.get(interaction.commandName) ||
      client.commands.get(interaction.customId?.split("_")[0]);
    try {
      const restriction = await getCommandRestriction(client, {
        command: commandForAccess, userId: interaction.user.id,
        guildId: interaction.guildId, channelId: interaction.channelId,
      });
      if (restriction) {
        if (interaction.type === InteractionType.ApplicationCommandAutocomplete) return interaction.respond([]).catch(() => {});
        return interaction.reply({ content: restriction, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (interaction.type === InteractionType.ApplicationCommand && commandForAccess) {
        const wait = checkCommandCooldown(interaction.user.id, commandForAccess);
        if (wait) return interaction.reply({ content: `Please wait ${wait}s before using this command again.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        const saved = await db.findOne({ Guild: interaction.guildId }).lean();
        if (saved?.Prefix) prefix = saved.Prefix;
      }
    } catch (error) {
      client.logger.log(`Interaction access check failed: ${error.message}`, "error");
      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) return interaction.respond([]).catch(() => {});
      return interaction.reply({ content: "The database is unavailable. Please try again shortly.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    if (interaction.isMessageComponent?.() && interaction.customId?.startsWith("help_")) {
      try {
        await client.commands.get("help").componentsV2(interaction, client);
      } catch (error) {
        client.logger.log(`Help navigation failed: ${error.message}`, "error");
        const response = { content: "The help menu could not be updated. Please run /help again.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
        else await interaction.reply(response).catch(() => {});
      }
      return;
    }

    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const command = client.slashCommands.get(interaction.commandName);
      if (!command || !command.autocomplete) return;

      try {
        await command.autocomplete(interaction, client);
      } catch (error) {
        console.error(`Autocomplete error for ${interaction.commandName}:`, error);
        client.logger.log(`Autocomplete error for ${interaction.commandName}: ${error.stack}`, "error");
      }
      return;
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
      if (!client.slashCommands) {
        client.logger.log("Slash commands collection is not initialized", "error");
        return;
      }

      const command = client.slashCommands.get(interaction.commandName);
      if (!command) return;

      if (command.botPerms) {
        if (
          !interaction.guild.members.me.permissions.has(
            PermissionsBitField.resolve(command.botPerms || []),
          )
        ) {
          return;
        }
      }

      if (command.userPerms) {
        if (
          !interaction.member.permissions.has(
            PermissionsBitField.resolve(command.userPerms || []),
          )
        ) {
          const permDisplay = new TextDisplayBuilder().setContent(
            `You need the **\`${command.userPerms.join(", ")}\`** permission(s) to use this command.`,
          );

          const container = new ContainerBuilder().addTextDisplayComponents(permDisplay);

          return interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => null);
        }
      }

      const player = interaction.client.manager.players.get(
        interaction.guildId,
      );
      if (command.player && !player) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} There is no player for this guild.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          return await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
      }
      if (command.inVoiceChannel && !interaction.member.voice.channel) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} You must be in a voice channel.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          return await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
      }
      if (command.sameVoiceChannel) {
        if (!interaction.guild || !interaction.guild.members.me) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} An error occurred. It seems the bot is not properly connected to the guild.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        const userVoiceChannel = interaction.member.voice.channel;

        if (botVoiceChannel) {
          if (userVoiceChannel !== botVoiceChannel) {
            const errorDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.warn} You must be in the same ${botVoiceChannel.toString()} to use this command.**`);

            const container = new ContainerBuilder()
              .addTextDisplayComponents(errorDisplay);

            return await interaction
              .reply({
                components: [container],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
              })
              .catch(() => { });
          }
        }
      }

      try {
        const interactionWrapper = {
          guild: interaction.guild,
          channel: interaction.channel,
          author: interaction.user,
          member: interaction.member,
          createdTimestamp: interaction.createdTimestamp,
          mentions: {
            channels: new Map()
          },
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
          const action = interaction.options.getString('action');
          const channel = interaction.options.getChannel('channel');
          const prefix = interaction.options.getString('prefix');
          const source = interaction.options.getString('source');
          const query = interaction.options.getString('query');
          const song = interaction.options.getString('song');
          const name = interaction.options.getString('name');
          const input = interaction.options.getString('input');
          const text = interaction.options.getString('text');
          const number = interaction.options.getInteger('number');
          const amount = interaction.options.getInteger('amount');
          const position = interaction.options.getInteger('position');

          if (action) args.push(action);
          if (channel) {
            args.push(channel.id);
            interactionWrapper.mentions.channels.set(channel.id, channel);
            interactionWrapper.mentions.channels.first = () => channel;
          }
          if (prefix) args.push(prefix);
          if (source) args.push(source);
          if (query) args.push(...query.split(' '));
          if (song) args.push(...song.split(' '));
          if (name) args.push(...name.split(' '));
          if (input) args.push(...input.split(' '));
          if (text) args.push(...text.split(' '));
          if (number !== null && number !== undefined) args.push(number.toString());
          if (amount !== null && amount !== undefined) args.push(amount.toString());
          if (position !== null && position !== undefined) args.push(position.toString());
        }

        if (command.slashExecute) {
          await command.slashExecute(interaction, client, prefix);
        } else if (command.execute) {
          await command.execute(interactionWrapper, args, client, prefix);
        } else if (command.run) {
          await command.run(client, interactionWrapper, prefix);
        }

        if (client.config.Webhooks?.cmdrun && client.config.Webhooks.cmdrun.startsWith("https://discord.com/api/webhooks/")) {
          const { WebhookClient, EmbedBuilder } = require("discord.js");
          const web = new WebhookClient({ url: client.config.Webhooks.cmdrun });

          const getCommandString = () => {
            let cmdString = `/${interaction.commandName}`;
            if (interaction.options) {
              const subcommand = interaction.options.getSubcommand(false);
              if (subcommand) {
                cmdString += ` ${subcommand}`;
              }
              const options = interaction.options.data;
              if (options && options.length > 0) {
                const optionStrings = options
                  .filter(opt => opt.type !== 1)
                  .map(opt => `${opt.name}:${opt.value}`)
                  .join(' ');
                if (optionStrings) cmdString += ` ${optionStrings}`;
              }
            }
            return cmdString;
          };

          const commandlog = new EmbedBuilder()
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .setColor(client.color)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setDescription(
              `**${client.emoji.dot} Command Used In:** \`${interaction.guild.name} | ${interaction.guild.id}\`\n` +
              `**${client.emoji.dot} Channel:** \`${interaction.channel.name} | ${interaction.channel.id}\`\n` +
              `**${client.emoji.dot} Command:** \`${command.name}\` (Slash)\n` +
              `**${client.emoji.dot} Executor:** \`${interaction.user.tag} | ${interaction.user.id}\`\n` +
              `**${client.emoji.dot} Content:** \`${getCommandString()}\``
            );

          web.send({ embeds: [commandlog] }).catch(console.error);
        }

      } catch (error) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} An unexpected error occurred.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
        client.logger.log(`Interaction Error: ${error.stack}`, "error");
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'bioset_modal' || interaction.customId.startsWith('bio_')) {
        try {
          if (!fs.existsSync(biosetCommandPath)) {
            client.logger.log("Bioset modal submitted, but Profile/bioset command is not installed.", "warn");

            const unavailableDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.warn} This profile form is not available right now.**`);

            const unavailableContainer = new ContainerBuilder()
              .addTextDisplayComponents(unavailableDisplay);

            await interaction.reply({
              components: [unavailableContainer],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            }).catch(() => { });
            return;
          }

          const command = require("../../commands/Profile/bioset");
          await command.modalHandler(interaction);
        } catch (error) {
          client.logger.log(`Error handling bioset modal submission: ${error.stack}`, "error");

          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} There was an error processing your input. Please try again.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => { });
        }
      }
    }

    if (interaction.isButton()) {
      const customIdParts = interaction.customId.split('_');
      const potentialCommandName = customIdParts[0];

      let command = client.commands.get(potentialCommandName);

      if (!command) {
        const commandName = client.aliases.get(potentialCommandName);
        if (commandName) {
          command = client.commands.get(commandName);
        }
      }

      if (command && typeof command.componentsV2 === 'function') {
        try {
          await command.componentsV2(interaction, client);
          return;
        } catch (error) {
          client.logger.log(`Error executing componentsV2 for ${potentialCommandName}: ${error.stack}`, "error");

          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.cross} An error occurred while processing this interaction.**`);

          const errorContainer = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          const errorMessage = {
            components: [errorContainer],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(() => { });
          } else {
            await interaction.reply(errorMessage).catch(() => { });
          }
          return;
        }
      }

      // Handle Now Playing Buttons
      const player = client.manager.players.get(interaction.guildId);
      if (player && player.data.get("nowPlayingMessage")?.id === interaction.message.id) {
        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceId) {
          return interaction.reply({ content: `**${client.emoji.warn} You must be in my voice channel to use these buttons.**`, flags: MessageFlags.Ephemeral });
        }

        const { updateNowPlayingButtons, emitDashboardPlayerState } = require("../Players/playerStart");

        switch (interaction.customId) {
          case "pause":
            await player.pause(!player.shoukaku.paused);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            emitDashboardPlayerState(client, player);
            await sendActionLog(client, interaction.guild, interaction.user, player.shoukaku.paused ? "Paused music" : "Resumed music", player.queue.current);
            await interaction.reply({ 
              content: `**${client.emoji.check} Player ${player.shoukaku.paused ? "Paused" : "Resumed"}**`, 
              flags: MessageFlags.Ephemeral 
            }).catch(() => { });
            break;

          case "skip":
            const currentTrack = player.queue.current;
            await player.skip();
            await sendActionLog(client, interaction.guild, interaction.user, "Skipped music", currentTrack);
            await interaction.reply({ 
              content: `**${client.emoji.check} Skipped current track**`, 
              flags: MessageFlags.Ephemeral 
            }).catch(() => { });
            break;

          case "stop":
            await sendActionLog(client, interaction.guild, interaction.user, "Stopped music");
            player.data.set("autoplay", false);
            player.queue.clear();
            player.loop = "none";
            try {
              await Promise.resolve(player.pause(false));
            } catch {}
            client.voiceHealthMonitor?.clearVoiceState(player);
            await player.skip();
            await interaction.reply({ 
              content: `**${client.emoji.check} Player Stopped**`, 
              flags: MessageFlags.Ephemeral 
            }).catch(() => { });
            break;

          case "loop":
            const modes = ["none", "track", "queue"];
            const currentModeIndex = modes.indexOf(player.loop || "none");
            const nextMode = modes[(currentModeIndex + 1) % modes.length];
            player.loop = nextMode;
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            emitDashboardPlayerState(client, player);
            await interaction.reply({ 
              content: `**${client.emoji.check} Loop mode set to: \`${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)}\`**`, 
              flags: MessageFlags.Ephemeral 
            }).catch(() => { });
            break;

          case "autoplay":
            const currentAuto = player.data.get("autoplay") || false;
            const newAutoStatus = !currentAuto;
            player.data.set("autoplay", newAutoStatus);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            emitDashboardPlayerState(client, player);
            await interaction.reply({ 
              content: `**${client.emoji.autoplay} Autoplay has been \`${newAutoStatus ? "Enabled" : "Disabled"}\`**`, 
              flags: MessageFlags.Ephemeral 
            }).catch(() => { });
            break;
        }
        return;
      }

      const data = await db3.findOne({ Guild: interaction.guildId });
      if (
        data &&
        interaction.channelId === data.Channel &&
        interaction.message.id === data.Message
      )
        return client.emit("playerButtons", interaction, data);
    }
  },
};
