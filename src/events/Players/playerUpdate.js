const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function sanitizePositionMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.min(numericValue, MAX_TRACK_DURATION_MS);
}

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

module.exports = {
  name: "playerUpdate",
  run: async (client, player, data) => {
    try {
      const lastTrackMeta = player.data?.get("lastTrackMeta") || null;
      let resolvedLength = getTrackLengthMs(player.queue.current) || getTrackLengthMs(lastTrackMeta);

      if (!resolvedLength) {
        const encodedTrack = player.queue.current?.track || player.queue.current?.encoded || player.shoukaku?.track;
        if (encodedTrack && player.shoukaku?.node?.rest?.decode) {
          try {
            const decodedTrack = await player.shoukaku.node.rest.decode(encodedTrack);
            resolvedLength = sanitizeTrackLengthMs(decodedTrack?.info?.length);
          } catch {}
        }
      }

      if (client.cluster) {
        client.cluster.send({
          type: "DASHBOARD_EVENT",
          event: "playerUpdate",
          data: { 
              guildId: player.guildId,
              position: sanitizePositionMs(data?.state?.position),
              length: resolvedLength,
              capturedAt: Date.now()
          }
        }).catch(() => {});
      }
    } catch (error) {
      console.error("Error in playerUpdate event:", error);
    }
  },
};
