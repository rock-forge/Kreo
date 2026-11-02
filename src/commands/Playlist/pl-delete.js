const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");
const { getUserPlaylistDocument, normalizePlaylistName } = require("../../utils/playlistUtils");

function buildReply(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = {
  name: "pl-delete",
  aliases: ["playlist-delete"],
  category: "Playlist",
  description: "Delete one of your playlists",
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
      description: "Playlist name",
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
      return message.reply(buildReply(`**${client.emoji.warn} Tell me which playlist to delete.**`));
    }

    try {
      const document = await getUserPlaylistDocument(message.author.id);
      const normalizedName = normalizePlaylistName(playlistName);
      const beforeCount = document.playlists.length;
      const target = document.playlists.find((playlist) => playlist.normalizedName === normalizedName);

      if (!target) {
        return message.reply(buildReply(`**${client.emoji.warn} I could not find a playlist named \`${playlistName}\`.**`));
      }

      document.playlists = document.playlists.filter((playlist) => playlist.normalizedName !== normalizedName);
      if (document.playlists.length === beforeCount) {
        return message.reply(buildReply(`**${client.emoji.warn} Nothing changed.**`));
      }

      await document.save();
      return message.reply(buildReply(`**${client.emoji.check} Deleted playlist \`${target.name}\`.**`));
    } catch (error) {
      console.error(error);
      return message.reply(buildReply(`**${client.emoji.cross} Could not delete that playlist right now.**`));
    }
  },
};
