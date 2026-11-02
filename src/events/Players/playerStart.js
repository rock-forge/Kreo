const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SectionBuilder
} = require("discord.js");
const { convertTime } = require("../../utils/convert.js");
const sendActionLog = require("../../utils/actionLogger");
const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function sanitizeTrackLengthMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_TRACK_DURATION_MS) {
    return 0;
  }

  return numericValue;
}

function getTrackLengthMs(track) {
  if (!track || typeof track !== "object") {
    return 0;
  }

  const candidates = [
    track.length,
    track.duration,
    track.info?.length,
    track.raw?.info?.length,
    typeof track.getRaw === "function" ? track.getRaw()?.info?.length : undefined,
  ];

  for (const candidate of candidates) {
    const safeLength = sanitizeTrackLengthMs(candidate);
    if (safeLength > 0) {
      return safeLength;
    }
  }

  return 0;
}

function getRequesterName(track) {
  if (!track) {
    return "Unknown";
  }

  const candidates = [
    typeof track.requester === "string" ? track.requester : undefined,
    track.requester?.username,
    track.requester?.globalName,
    track.requester?.displayName,
    track.requester?.tag,
    typeof track.userData === "string" ? track.userData : undefined,
    track.userData?.username,
    track.userData?.globalName,
    track.userData?.displayName,
    track.userData?.tag,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Unknown";
}

async function resolveTrackLengthMs(player, track) {
  const directLength = getTrackLengthMs(track);
  if (directLength > 0) {
    return directLength;
  }

  const encodedTrack = track?.track || track?.encoded || player?.shoukaku?.track;
  if (!encodedTrack || !player?.shoukaku?.node?.rest?.decode) {
    return 0;
  }

  try {
    const decodedTrack = await player.shoukaku.node.rest.decode(encodedTrack);
    const decodedLength = sanitizeTrackLengthMs(decodedTrack?.info?.length);
    if (decodedLength > 0) {
      return decodedLength;
    }
  } catch {}

  const repairQuery = [track?.title, typeof track?.author === "string" ? track.author.replace(/\s*-\s*Topic\s*$/i, "").trim() : ""]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .trim();

  if (!repairQuery || !player?.kazagumo?.search) {
    return 0;
  }

  try {
    const repairResult = await player.kazagumo.search(repairQuery, {
      engine: "ytsearch",
      requester: track?.requester,
    });
    const repairedTrack =
      repairResult?.tracks?.find((candidate) => sanitizeTrackLengthMs(candidate?.length) > 0) || null;
    return repairedTrack ? sanitizeTrackLengthMs(repairedTrack.length) : 0;
  } catch {
    return 0;
  }
}

async function normalizeTrackForDisplay(player, track) {
  if (!track) {
    return track;
  }

  const resolvedLength = await resolveTrackLengthMs(player, track);
  if (resolvedLength > 0) {
    track.length = resolvedLength;
  }

  if (!track.requester || getRequesterName(track) === "Unknown") {
    const lastTrackMeta = player?.data?.get("lastTrackMeta");
    if (lastTrackMeta?.requester) {
      track.requester = {
        username: lastTrackMeta.requester,
        id: track.requester?.id || "0",
      };
    }
  }

  return track;
}

function emitDashboardPlayerState(client, player, overrides = {}) {
  if (!client?.cluster || !player) {
    return;
  }

  client.cluster.send({
    type: "DASHBOARD_EVENT",
    event: "playerStateUpdate",
    data: {
      guildId: player.guildId,
      paused: Boolean(overrides.paused ?? player.shoukaku?.paused ?? player.paused),
      volume: Number(overrides.volume ?? player.volume) || 0,
      playing: Boolean(overrides.playing ?? player.playing),
      position: Number(overrides.position ?? player.position) || 0,
      capturedAt: Date.now(),
    }
  }).catch(() => {});
}

module.exports = {
  name: "playerStart",
  run: async (client, player, track) => {
    if (!player || !track) return;

    try {
      const channel = client.channels.cache.get(player.textId);
      if (!channel) return;
      const displayTrack = await normalizeTrackForDisplay(player, track);

      try {
        if (!player.data) player.data = new Map();
        const previousTrack = player.data.get("lastTrack");
        if (previousTrack && previousTrack.uri && previousTrack.uri !== displayTrack.uri) {
          const history = player.data.get("history") || [];
          const previousHistoryEntry = {
            title: previousTrack.title,
            author: previousTrack.author,
            uri: previousTrack.uri,
            length: previousTrack.length,
            thumbnail: previousTrack.thumbnail || previousTrack.artworkUrl,
          };

          history.push(previousHistoryEntry);
          if (history.length > 25) {
            history.shift();
          }
          player.data.set("history", history);
        }

        player.data.set("lastTrack", displayTrack);
        player.data.set("lastTrackMeta", {
          title: displayTrack.title || null,
          author: displayTrack.author || null,
          uri: displayTrack.uri || null,
          identifier: displayTrack.identifier || null,
          length: getTrackLengthMs(displayTrack),
          thumbnail: displayTrack.thumbnail || displayTrack.artworkUrl || null,
          requester: getRequesterName(displayTrack),
        });
        client.voiceHealthMonitor?.updateActivity(player.guildId);
        // Immediately update voice status for fast changes
        client.voiceHealthMonitor?.updateVoiceState(player, displayTrack);

        // Send IPC message to Bot Bridge for the dashboard
        if (client.cluster) {
            client.cluster.send({
                type: "DASHBOARD_EVENT",
                event: "trackStart",
                data: {
                    guildId: player.guildId,
                    position: 0,
                    capturedAt: Date.now(),
                    track: {
                        title: displayTrack.title,
                        author: displayTrack.author,
                        uri: displayTrack.uri,
                        identifier: displayTrack.identifier || null,
                        length: getTrackLengthMs(displayTrack),
                        thumbnail: displayTrack.thumbnail || displayTrack.artworkUrl,
                        requester: getRequesterName(displayTrack)
                    }
                }
            }).catch(() => {});
        }

        const guild = client.guilds.cache.get(player.guildId);
        if (guild) {
          const user = displayTrack.requester || client.user;
          await sendActionLog(client, guild, user, "Started playing track", displayTrack, {
            source: displayTrack.requestSource || "bot_commands",
          });
        }
      } catch (e) { console.error("Error in playerStart catch block:", e); }

      const container = await createNowPlayingContainer(client, player, displayTrack);

      const message = await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

      player.data.set("nowPlayingMessage", message);
    } catch (error) {
      console.error("Error in playerStart event:", error);
    }
  },

  updateNowPlayingButtons: async (client, player, isPaused) => {
      try {
        const message = player.data.get("nowPlayingMessage");
        if (!message || !player.queue.current) return;

      const container = await createNowPlayingContainer(client, player, player.queue.current, isPaused);

      await message.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {
        player.data.delete("nowPlayingMessage");
      });
      } catch (error) {
        console.error("Error updating now playing buttons:", error);
      }
  },
  emitDashboardPlayerState,
};

async function createNowPlayingContainer(client, player, track, forcePaused = null) {
  const isPaused = forcePaused !== null ? forcePaused : player.shoukaku.paused;

  const cleanAuthorName = (author) => {
    if (!author) return 'Unknown Artist';
    return author.replace(/\s*-\s*Topic\s*$/i, '').trim();
  };

  const truncateTitle = (title, maxLength = 25) => {
    if (!title) return 'Unknown Title';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  const getCleanThumbnail = (thumbnailUrl) => {
    if (!thumbnailUrl) return null;
    if (thumbnailUrl.includes('i.ytimg.com') || thumbnailUrl.includes('img.youtube.com')) {
      const videoIdMatch = thumbnailUrl.match(/vi\/([^\/]+)\//);
      if (videoIdMatch && videoIdMatch[1]) {
        return `https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
      }
    }
    return thumbnailUrl;
  };

  const headerDisplay = new TextDisplayBuilder()
    .setContent(`### Now Playing [${truncateTitle(track.title)}](${track.uri})`);

  const infoDisplay = new TextDisplayBuilder()
    .setContent(
      `> - **Author:** [${cleanAuthorName(track.author)}](${track.uri})\n` +
      `> - **Duration:** \`${convertTime(track.length)}\`\n` +
      `> - **Requester:** [${track.requester?.username || "Dashboard"}](https://discord.com/users/${track.requester?.id || "0"})`
    );

  const section = new SectionBuilder()
    .addTextDisplayComponents(headerDisplay, infoDisplay);

  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  if (thumbnail) {
    section.setThumbnailAccessory((thumb) => thumb.setURL(thumbnail));
  }

  const container = new ContainerBuilder();
  if (thumbnail) container.addSectionComponents(section);
  else container.addTextDisplayComponents(headerDisplay, infoDisplay);
  container.addSeparatorComponents(new SeparatorBuilder());

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pause")
      .setEmoji(isPaused ? client.emoji.play : client.emoji.pause)
      .setLabel(isPaused ? "Resume" : "Pause")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setEmoji(client.emoji.skip)
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("stop")
      .setEmoji(client.emoji.stop)
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("loop")
      .setEmoji(client.emoji.loop)
      .setLabel("Loop")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("autoplay")
      .setEmoji(client.emoji.autoplay)
      .setLabel("Autoplay")
      .setStyle(player.data.get("autoplay") ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  container.addActionRowComponents(row1);

  return container;
}
