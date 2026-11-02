const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");
const {
  findPlaylist,
  getUserPlaylistDocument,
  queuePlaylistTracks,
} = require("../../utils/playlistUtils");

function buildReply(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = {
  name: "pl-play",
  aliases: ["playlist-play"],
  category: "Playlist",
  description: "Queue a saved playlist into the current voice session",
  args: false,
  usage: "<playlist name>",
  userPerms: [],
  owner: false,
  player: false,
  inVoiceChannel: true,
  sameVoiceChannel: true,
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
      return message.reply(buildReply(`**${client.emoji.warn} Tell me which playlist to play.**`));
    }

    try {
      const document = await getUserPlaylistDocument(message.author.id);
      const playlist = findPlaylist(document, playlistName);
      if (!playlist) {
        return message.reply(buildReply(`**${client.emoji.warn} I could not find a playlist named \`${playlistName}\`.**`));
      }

      if (!Array.isArray(playlist.songs) || playlist.songs.length === 0) {
        return message.reply(buildReply(`**${client.emoji.info} \`${playlist.name}\` is empty right now.**`));
      }

      let player = client.manager.players.get(message.guild.id);
      if (!player) {
        player = await client.manager.createPlayer({
          guildId: message.guild.id,
          voiceId: message.member.voice.channel.id,
          textId: message.channel.id,

          deaf: true,
        });
      } else {
        if (player.voiceId !== message.member.voice.channel.id) {
          return message.reply(buildReply(`**${client.emoji.warn} You must be in the same voice channel as the bot.**`));
        }

        if (player.textId !== message.channel.id) {
          player.textId = message.channel.id;
        }
      }

      const wasIdle = !player.playing && !player.paused && player.queue.size === 0;
      const { addedCount, failedCount } = await queuePlaylistTracks(
        player,
        playlist.songs,
        message.author,
        "playlist_command"
      );

      if (!player.playing && !player.paused && player.queue.size > 0) {
        await player.play();
      }

      if (!addedCount) {
        return message.reply(buildReply(`**${client.emoji.cross} None of the saved tracks could be queued from \`${playlist.name}\`.**`));
      }

      return message.reply(
        buildReply(
          `**${client.emoji.check} Queued \`${addedCount}\` track${addedCount === 1 ? "" : "s"} from \`${playlist.name}\`**\n` +
          `${failedCount ? `**${client.emoji.warn} Failed to load \`${failedCount}\` saved track${failedCount === 1 ? "" : "s"}**\n` : ""}` +
          `${wasIdle ? `**${client.emoji.info} Playback started immediately.**` : `**${client.emoji.info} Added to the current queue.**`}`
        )
      );
    } catch (error) {
      console.error(error);
      return message.reply(buildReply(`**${client.emoji.cross} Could not queue that playlist right now.**`));
    }
  },
};
