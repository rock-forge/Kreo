

const { Kazagumo, KazagumoTrack } = require("kazagumo");
const { Connectors, LoadType, Constants } = require("shoukaku");
const { State } = Constants;
const Prefix = require("../schema/prefix");
const { sessionRecoveryStructures } = require("../utils/lavalinkSessionRecovery");

const searchEngines = {
  DEEZER: "dzsearch",
  SPOTIFY: "spsearch",
  YOUTUBE: "ytsearch",
  JIO_SAAVAN: "jssearch",
  APPLE_MUSIC: "amsearch",
  YOUTUBE_MUSIC: "ytmsearch"
};

const fallbackEngines = ["ytmsearch", "amsearch", "spsearch", "ytsearch"];

module.exports = function loadPlayerManager(client) {
  const manager = new Kazagumo(
    {
      defaultSearchEngine: client.config.node_source,
      send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      }
    },
    new Connectors.DiscordJS(client),
    client.config.nodes,
    {
      ...client.config.node_options,
      structures: sessionRecoveryStructures(client, client.config.node_options?.structures),
    }
  );

  manager.searchEngines = searchEngines;

  manager.defaultSearchEngine = client.config.node_source;

  const createPlayer = manager.createPlayer.bind(manager);
  manager.createPlayer = async function (options) {
    if (options.volume === undefined) {
      const saved = await Prefix.findOne({ Guild: options.guildId }).lean();
      const volume = Number(saved?.Volume);
      options = { ...options, volume: Number.isFinite(volume) && volume > 0 ? Math.min(100, Math.round(volume)) : 80 };
    }
    const player = await createPlayer(options);
    client.voiceHealthMonitor?.startMonitoring(player);
    return player;
  };

  manager.search = async function (query, options = {}) {
    if (typeof query !== "string" || !query.trim()) return { type: "SEARCH", tracks: [] };
    query = query.trim();
    const nodes = [...this.shoukaku.nodes.values()]
      .filter((node) => node.state === State.CONNECTED)
      .sort((a, b) => Number(b.name === options.nodeName) - Number(a.name === options.nodeName));
    if (!nodes.length) return { type: "SEARCH", tracks: [] };

    const isUrl = /^https?:\/\//.test(query);

    if (isUrl) {
      for (const node of nodes) {
        const directRes = await node.rest.resolve(query).catch(() => null);
        if (directRes && directRes.loadType !== LoadType.ERROR) {
          const result = processSearchResult(directRes, options.requester);
          if (result.tracks.length) return result;
        }
      }

      if (query.includes('youtube.com') || query.includes('youtu.be')) {
        const videoId = query.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1];
        if (videoId) {
          query = `intitle:${videoId}`;
        }
      }
    }

    let searchEngineList = [options.engine || this.defaultSearchEngine];
    searchEngineList = [...new Set([...searchEngineList, ...fallbackEngines])];

    for (const engine of searchEngineList) {
      const searchQuery = `${engine}:${query}`;
      for (const node of nodes) {
        const res = await node.rest.resolve(searchQuery).catch(() => null);
        if (res && res.loadType !== LoadType.ERROR && res.data) {
          const result = processSearchResult(res, options.requester);
          if (result.tracks.length) return result;
        }
      }
    }

    return { type: "SEARCH", tracks: [] };
  };

  function processSearchResult(res, requester) {
    switch (res.loadType) {
      case LoadType.TRACK:
        return {
          type: "TRACK",
          tracks: [new KazagumoTrack(res.data, requester)]
        };
      case LoadType.PLAYLIST:
        return {
          type: "PLAYLIST",
          playlistName: res.data.info.name,
          tracks: res.data.tracks.map((track) => new KazagumoTrack(track, requester))
        };
      case LoadType.SEARCH:
        return {
          type: "SEARCH",
          tracks: res.data.map((track) => new KazagumoTrack(track, requester))
        };
      default:
        return { type: "SEARCH", tracks: [] };
    }
  }

  client.manager = manager;
  return manager;
};
