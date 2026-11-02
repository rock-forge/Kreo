

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const { ClusterClient, getInfo } = require("discord-hybrid-sharding");
const loadPlayerManager = require("../loaders/loadPlayerManager");
const VoiceHealthMonitor = require("../utils/voiceHealthMonitor");

class MusicBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      properties: {
        browser: "Discord Android",
      },
      allowedMentions: {
        parse: ["roles", "users", "everyone"],
        repliedUser: false,
      },
      shards: getInfo().SHARD_LIST,
      shardCount: getInfo().TOTAL_SHARDS,
    });

    this.commands = new Collection();
    this.slashCommands = new Collection();
    this.config = require("../config.js");
    this.owners = this.config.ownerID;
    this.prefix = this.config.prefix;
    this.color = this.config.color;
    this.embedColor = this.config.color;
    this.button = require("../custom/button.js");
    this.embed = require("../custom/embed.js")(this.color);
    require("../custom/numformat")(this);
    this.aliases = new Collection();
    this.logger = require("../utils/logger.js");
    this.emoji = require("../emojis.js");
    this.cluster = new ClusterClient(this);
    if (!this.token) this.token = this.config.token;
    this.manager = null;
    this.spamMap = new Map();
    this.cooldowns = new Collection();
    this.voiceHealthMonitor = new VoiceHealthMonitor(this);

    this.databaseReady = this._connectMongodb();
    loadPlayerManager(this);
    [
      "loadClients",
      "loadCommands",
      "loadNodes",
      "loadPlayers",
    ].forEach((handler) => {
      require(`../loaders/${handler}`)(this);
    });
  }
  async _connectMongodb() {
    const dbOptions = {
      autoIndex: false,
      connectTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      serverSelectionTimeoutMS: 60000,
      family: 4,
    };

    mongoose.set("strictQuery", false);
    mongoose.Promise = global.Promise;

    mongoose.connection.on("connected", () => {
      this.logger.log("[DB] Database connected", "ready");
    });

    mongoose.connection.on("error", (err) => {
      this.logger.log(`[DB] Mongoose connection error: ${err.stack}`, "error");
    });

    mongoose.connection.on("disconnected", () => {
      this.logger.log("[DB] Mongoose disconnected", "error");
    });
    await mongoose.connect(this.config.mongourl, dbOptions);
  }

  async connect() {
    await this.databaseReady;
    return super.login(this.token);
  }
}

module.exports = MusicBot;
