const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");
const {
  findPlaylist,
  getUserPlaylistDocument,
  touchPlaylist,
} = require("../../utils/playlistUtils");

function buildReply(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

function parsePlaylistAndPosition(args) {
  const raw = args.join(" ").trim();
  if (!raw) {
    return { playlistName: "", position: NaN };
  }

  const [playlistPart, positionPart = ""] = raw.split("|");
  return {
    playlistName: playlistPart.trim(),
    position: Number(positionPart.trim()),
  };
}

module.exports = {
  name: "pl-remove",
  aliases: ["playlist-remove"],
  category: "Playlist",
  description: "Remove one song from one of your playlists",
  args: false,
  usage: "<playlist name> | <song number>",
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
    {
      name: "position",
      description: "Song number to remove",
      type: 4,
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

    return this.execute(
      interactionWrapper,
      [interaction.options.getString("name") || "", "|", String(interaction.options.getInteger("position") || "")],
      client
    );
  },

  async execute(message, args, client) {
    const { playlistName, position } = parsePlaylistAndPosition(args);
    if (!playlistName || !Number.isFinite(position) || position < 1) {
      return message.reply(buildReply(`**${client.emoji.warn} Use \`.pl-remove <playlist> | <song number>\`**`));
    }

    try {
      const document = await getUserPlaylistDocument(message.author.id);
      const playlist = findPlaylist(document, playlistName);
      if (!playlist) {
        return message.reply(buildReply(`**${client.emoji.warn} I could not find a playlist named \`${playlistName}\`.**`));
      }

      const targetIndex = position - 1;
      const track = playlist.songs?.[targetIndex];
      if (!track) {
        return message.reply(buildReply(`**${client.emoji.warn} Song \`${position}\` does not exist in \`${playlist.name}\`.**`));
      }

      playlist.songs.splice(targetIndex, 1);
      touchPlaylist(playlist);
      await document.save();

      return message.reply(buildReply(`**${client.emoji.check} Removed \`${track.title}\` from \`${playlist.name}\`.**`));
    } catch (error) {
      console.error(error);
      return message.reply(buildReply(`**${client.emoji.cross} Could not remove that song right now.**`));
    }
  },
};
