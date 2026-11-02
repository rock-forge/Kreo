const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const os = require("os");
const mongoose = require('mongoose');
const emoji = require('../../emojis');

module.exports = {
  name: "stats",
  category: "Information",
  description: "Show detailed bot statistics",
  args: false,
  usage: "",
  aliases: ["statistics", "botinfo", "bi"],
  userPerms: [],
  owner: false,
  slashOptions: [],
  async slashExecute(interaction, client) {
    await interaction.deferReply().catch(() => {});
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(options);
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
    try {
      // Loading indicator
      const loadingText = new TextDisplayBuilder()
      .setContent(`### ${emoji.load} Loading statistics...`);

    const loadingContainer = new ContainerBuilder()
      .addTextDisplayComponents(loadingText);

    const loadingMsg = await message.reply({
      components: [loadingContainer],
      flags: MessageFlags.IsComponentsV2
    });

    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor(uptime / 3600) % 24;
    const minutes = Math.floor(uptime / 60) % 60;

    const memoryUsage = process.memoryUsage();
    const rssInMB = Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100;
    const heapUsed = Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100;
    const heapTotal = Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100;

    const guildCount = client.guilds.cache.size;
    const userCount = client.users.cache.size;
    const channelCount = client.channels.cache.size;
    const textChannels = client.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = client.channels.cache.filter(c => c.type === 2).size;

    const manager = client.manager;
    const players = Array.from(manager.players.values());
    const totalPlayers = players.length;
    const playingPlayers = players.filter(p => p.playing).length;
    const pausedPlayers = players.filter(p => p.paused).length;
    const totalTracks = players.reduce((acc, p) => acc + p.queue.size + (p.queue.current ? 1 : 0), 0);

    const commandsCount = client.commands?.size || 0;

    const shardId = message.guild?.shardId || 0;
    const totalShards = client.shard?.count || 1;
    const clusterId = client.cluster?.id || 0;
    const totalClusters = client.cluster?.count || 1;

    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const dbName = mongoose.connection.readyState === 1 ? mongoose.connection.name || 'MongoDB' : 'N/A';

    const node = manager.shoukaku.nodes.values().next().value;
    const nodeName = node?.name || 'N/A';
    const nodeVersion = node?.info?.version || 'N/A';
    const nodeMemUsed = node?.stats?.memory?.used ? Math.round((node.stats.memory.used / 1024 / 1024) * 100) / 100 : 0;
    const nodeCpuLoad = node?.stats?.cpu?.systemLoad ? Math.round(node.stats.cpu.systemLoad * 10000) / 100 : 0;

    const nodeJsVersion = process.version;
    const djsVersion = require('discord.js').version;
    const platform = os.platform();
    const arch = os.arch();
    const cpuModel = os.cpus()[0]?.model || 'Unknown';
    const cpuCores = os.cpus().length;
    const cpuSpeed = os.cpus()[0]?.speed || 0;
    const totalMemory = Math.round((os.totalmem() / 1024 / 1024) * 100) / 100;
    const freeMemory = Math.round((os.freemem() / 1024 / 1024) * 100) / 100;
    const usedMemory = Math.round((totalMemory - freeMemory) * 100) / 100;

    const formatNumber = (num) => {
      if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
      return num.toString();
    };

    const statsPages = {
      bot: {
        title: 'Bot Statistics',
        content: `\`\`\`yml\nUsername         : ${client.user.username}#${client.user.discriminator}\nBot ID           : ${client.user.id}\nServers          : ${formatNumber(guildCount)}\nUsers            : ${formatNumber(userCount)}\nChannels         : ${formatNumber(channelCount)}\nCommands         : ${commandsCount}\nShards           : ${shardId + 1} / ${totalShards}\nClusters         : ${clusterId + 1} / ${totalClusters}\n\`\`\``
      },
      music: {
        title: 'Music Statistics',
        content: `\`\`\`yml\nActive Players   : ${totalPlayers}\nPlaying Now      : ${playingPlayers}\nPaused Players   : ${pausedPlayers}\nTotal Songs Queue: ${totalTracks}\nNode             : ${nodeName}\nLavalink Version : ${nodeVersion}\n\`\`\``
      },
      system: {
        title: 'System Information',
        content: `\`\`\`yml\nAPI Latency      : ${client.ws.ping} ms\nUptime           : ${days}d ${hours}h ${minutes}m\nMemory (RSS)     : ${rssInMB} MB\nHeap Used        : ${heapUsed} MB\nHeap Total       : ${heapTotal} MB\nPlatform         : ${platform} (${arch})\nCPU Model        : ${cpuModel}\nCPU Cores        : ${cpuCores}\nCPU Speed        : ${cpuSpeed} MHz\nNode.js          : ${nodeJsVersion}\nDiscord.js       : v${djsVersion}\nDatabase         : ${dbName} (${dbStatus})\n\`\`\``
      },
      node: {
        title: 'Node Performance',
        content: `\`\`\`yml\nNode Memory      : ${nodeMemUsed} MB\nNode CPU Load    : ${nodeCpuLoad}%\nSystem RAM Total : ${totalMemory.toFixed(2)} MB\nSystem RAM Used  : ${usedMemory.toFixed(2)} MB\nSystem RAM Free  : ${freeMemory.toFixed(2)} MB\n\`\`\``
      }
    };

    const createStatsDisplay = (page) => {
      const header = new TextDisplayBuilder()
        .setContent(`### ${client.user.username}'s Statistics\n-# Requested by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`);

      const separator1 = new SeparatorBuilder();

      const categoryHeader = new TextDisplayBuilder()
        .setContent(`**${statsPages[page].title}**`);

      const separator2 = new SeparatorBuilder();

      const content = new TextDisplayBuilder()
        .setContent(statsPages[page].content);

      const separator3 = new SeparatorBuilder();

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`stats_select_${message.author.id}`)
        .setPlaceholder('Select a statistics category')
        .addOptions([
          {
            label: 'Bot Statistics',
            description: 'View bot information and server counts',
            value: 'bot',
            default: page === 'bot'
          },
          {
            label: 'Music Statistics',
            description: 'View music player and queue information',
            value: 'music',
            default: page === 'music'
          },
          {
            label: 'System Information',
            description: 'View system and platform details',
            value: 'system',
            default: page === 'system'
          },
          {
            label: 'Node Performance',
            description: 'View Lavalink node performance metrics',
            value: 'node',
            default: page === 'node'
          }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(separator1)
        .addTextDisplayComponents(categoryHeader)
        .addSeparatorComponents(separator2)
        .addTextDisplayComponents(content)
        .addSeparatorComponents(separator3)
        .addActionRowComponents(row);

      return container;
    };

    await loadingMsg.edit({
      content: '',
      components: [createStatsDisplay('bot')],
      flags: MessageFlags.IsComponentsV2
    });

    const collector = loadingMsg.createMessageComponentCollector({
      filter: (i) => i.customId === `stats_select_${message.author.id}` && i.user.id === message.author.id,
      time: 60000
    });

    collector.on('collect', async (interaction) => {
      const page = interaction.values[0];

      await interaction.update({
        content: '',
        components: [createStatsDisplay(page)],
        flags: MessageFlags.IsComponentsV2
      });
    });

    collector.on('end', () => {
      const disabledMenu = new StringSelectMenuBuilder()
        .setCustomId('stats_select_disabled')
        .setPlaceholder('This menu has timed out')
        .setDisabled(true)
        .addOptions([
          {
            label: 'Bot Statistics',
            value: 'bot'
          }
        ]);

      const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

      const header = new TextDisplayBuilder()
        .setContent(`### ${client.user.username}'s Statistics\n-# Requested by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`);

      const separator1 = new SeparatorBuilder();

      const categoryHeader = new TextDisplayBuilder()
        .setContent(`**Bot Statistics**`);

      const separator2 = new SeparatorBuilder();

      const content = new TextDisplayBuilder()
        .setContent(statsPages.bot.content);

      const separator3 = new SeparatorBuilder();

      const container = new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(separator1)
        .addTextDisplayComponents(categoryHeader)
        .addSeparatorComponents(separator2)
        .addTextDisplayComponents(content)
        .addSeparatorComponents(separator3)
        .addActionRowComponents(disabledRow);

      loadingMsg.edit({
        content: '',
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    });
  } catch (error) {
      console.error('Error in stats command:', error);
      if (message.reply) {
        message.reply({ content: 'An error occurred while fetching statistics. Please try again later.' }).catch(() => {});
      }
    }
  }
};
