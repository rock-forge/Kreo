const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");
const {
  MAX_PLAYLISTS_PER_USER,
  findPlaylist,
  getUserPlaylistDocument,
  normalizePlaylistName,
} = require("../../utils/playlistUtils");

function reply(message, client, content) {
  const display = new TextDisplayBuilder().setContent(content);
  const container = new ContainerBuilder().addTextDisplayComponents(display);

  return message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

module.exports = {
  name: "pl-create",
  aliases: ["playlist-create"],
  category: "Playlist",
  description: "Create a personal playlist",
  args: false,
  usage: "<playlist name>",
  userPerms: [],
  owner: false,
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [
    {
      name: "name",
      description: "Name of the playlist",
      type: 3,
      required: true,
    },
  ],

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

    return this.execute(interactionWrapper, [interaction.options.getString("name") || ""], client);
  },

  async execute(message, args, client) {
    const playlistName = args.join(" ").trim();
    if (!playlistName) {
      return reply(message, client, `**${client.emoji.warn} Provide a playlist name.**`);
    }

    if (playlistName.length > 40) {
      return reply(message, client, `**${client.emoji.warn} Playlist names must stay under \`40\` characters.**`);
    }

    const userId = message.author.id;

    try {
      const document = await getUserPlaylistDocument(userId);

      if (document.playlists.length >= MAX_PLAYLISTS_PER_USER) {
        return reply(
          message,
          client,
          `**${client.emoji.warn} You already have the maximum of \`${MAX_PLAYLISTS_PER_USER}\` playlists.**`
        );
      }

      if (findPlaylist(document, playlistName)) {
        return reply(message, client, `**${client.emoji.info} A playlist named \`${playlistName}\` already exists.**`);
      }

      document.playlists.unshift({
        name: playlistName,
        normalizedName: normalizePlaylistName(playlistName),
        songs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await document.save();

      return reply(
        message,
        client,
        `**${client.emoji.check} Created playlist \`${playlistName}\`**\nYou can now use \`.pl-add ${playlistName} | song name\` to save tracks into it.`
      );
    } catch (error) {
      console.error(error);
      return reply(message, client, `**${client.emoji.cross} Could not create that playlist right now.**`);
    }
  },
};
