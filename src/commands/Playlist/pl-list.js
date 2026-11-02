const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { getUserPlaylistDocument } = require("../../utils/playlistUtils");

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
}

module.exports = {
  name: "pl-list",
  aliases: ["playlist-list", "playlists"],
  category: "Playlist",
  description: "List your personal playlists",
  args: false,
  usage: "",
  userPerms: [],
  owner: false,
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) return interaction.editReply(options);
        if (interaction.replied) return interaction.followUp(options);
        return interaction.reply(options);
      },
    };

    return this.execute(interactionWrapper, [], client);
  },

  async execute(message, args, client) {
    try {
      const document = await getUserPlaylistDocument(message.author.id);
      const playlists = Array.isArray(document.playlists) ? [...document.playlists] : [];

      if (playlists.length === 0) {
        const display = new TextDisplayBuilder().setContent(
          `**${client.emoji.info} You do not have any playlists yet.**\nCreate one with \`.pl-create My Playlist\`.`
        );
        const container = new ContainerBuilder().addTextDisplayComponents(display);
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const header = new TextDisplayBuilder().setContent(`## ${message.author.username}'s Playlists`);
      const lines = playlists
        .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
        .slice(0, 20)
        .map(
          (playlist, index) =>
            `**${index + 1}. ${playlist.name}**\n> ${playlist.songs.length} track${playlist.songs.length === 1 ? "" : "s"} • updated ${formatDate(playlist.updatedAt)}`
        )
        .join("\n\n");

      const body = new TextDisplayBuilder().setContent(lines);
      const tip = new TextDisplayBuilder().setContent(
        `Use \`.pl-play <name>\` to queue a playlist or \`.pl-add <name> | song name\` to save another song.`
      );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(body)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(tip);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.error(error);
      const display = new TextDisplayBuilder().setContent(`**${client.emoji.cross} Could not load your playlists.**`);
      const container = new ContainerBuilder().addTextDisplayComponents(display);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },
};
