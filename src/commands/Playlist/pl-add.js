const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");
const {
  MAX_TRACKS_PER_PLAYLIST,
  createPlaylistTrackSnapshot,
  findPlaylist,
  getUserPlaylistDocument,
  normalizePlaylistName,
  touchPlaylist,
} = require("../../utils/playlistUtils");

function buildReply(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

function parsePlaylistAndQuery(args) {
  const raw = args.join(" ").trim();
  if (!raw) {
    return { playlistName: "", query: "" };
  }

  const [playlistPart, ...queryParts] = raw.split("|");
  return {
    playlistName: playlistPart.trim(),
    query: queryParts.join("|").trim(),
  };
}

module.exports = {
  name: "pl-add",
  aliases: ["playlist-add"],
  category: "Playlist",
  description: "Add the current track or a searched track to one of your playlists",
  args: false,
  usage: "<playlist name> | <song name or link>",
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
      name: "song",
      description: "Song name or direct link. Leave blank to save the current track.",
      type: 3,
      required: false,
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

    const playlistName = interaction.options.getString("name") || "";
    const song = interaction.options.getString("song") || "";
    const args = song ? [playlistName, "|", song] : [playlistName];
    return this.execute(interactionWrapper, args, client);
  },

  async execute(message, args, client) {
    const { playlistName, query } = parsePlaylistAndQuery(args);
    if (!playlistName) {
      return message.reply(buildReply(`**${client.emoji.warn} Tell me which playlist to save into.**\nExample: \`.pl-add Focus Mix | Night drive phonk\``));
    }

    try {
      const document = await getUserPlaylistDocument(message.author.id);
      const playlist = findPlaylist(document, normalizePlaylistName(playlistName));
      if (!playlist) {
        return message.reply(buildReply(`**${client.emoji.warn} I could not find a playlist named \`${playlistName}\`.**`));
      }

      if (playlist.songs.length >= MAX_TRACKS_PER_PLAYLIST) {
        return message.reply(
          buildReply(`**${client.emoji.warn} \`${playlist.name}\` is full.**\nEach playlist can hold up to \`${MAX_TRACKS_PER_PLAYLIST}\` tracks.`)
        );
      }

      let track = null;
      if (query) {
        const isDirectUrl = /^https?:\/\//i.test(query);
        const searchResult = await client.manager.search(query, {
          requester: message.author,
          ...(isDirectUrl ? {} : { engine: client.config.node_source || "spsearch" }),
        });
        track = searchResult?.tracks?.[0] || null;
      } else {
        const player = client.manager.players.get(message.guild.id);
        track = player?.queue?.current || null;
      }

      if (!track) {
        return message.reply(
          buildReply(`**${client.emoji.warn} No track was found.**\nPass a song with \`|\` or play something first, then run the command again.`)
        );
      }

      const snapshot = createPlaylistTrackSnapshot(track);
      if (!snapshot.url) {
        return message.reply(buildReply(`**${client.emoji.cross} I could not save that track because it has no stable URL.**`));
      }

      const duplicate = playlist.songs.find((song) => song.url === snapshot.url);
      if (duplicate) {
        return message.reply(buildReply(`**${client.emoji.info} That song is already in \`${playlist.name}\`.**`));
      }

      playlist.songs.push(snapshot);
      touchPlaylist(playlist);
      await document.save();

      return message.reply(
        buildReply(`**${client.emoji.check} Saved \`${snapshot.title}\` to \`${playlist.name}\`**\nPlaylist size: \`${playlist.songs.length}\` track${playlist.songs.length === 1 ? "" : "s"}.`)
      );
    } catch (error) {
      console.error(error);
      return message.reply(buildReply(`**${client.emoji.cross} Could not save that track to your playlist.**`));
    }
  },
};
