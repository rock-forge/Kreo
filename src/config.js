require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const crypto = require("crypto");

function requireEnv(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`[Config] Missing required environment variable: ${name}`);
    }

    return value;
}

function parseBoolean(value) {
    if (typeof value === "string") {
        value = value.trim().toLowerCase();
    }
    switch (value) {
        case true:
        case "true":
            return true;
        default:
            return false;
    }
}

function parseList(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

const discordClientId = process.env.DISCORD_CLIENT_ID || "";
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET || "";
const dashboardUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
const supportServerUrl = process.env.SUPPORT_SERVER_URL || "";

function deriveDashboardBridgeSecret() {
    if (process.env.DASHBOARD_BRIDGE_SECRET) return process.env.DASHBOARD_BRIDGE_SECRET;
    if (!discordClientId || !discordClientSecret) {
        return "";
    }

    return crypto
        .createHash("sha256")
        .update(`kreo-dashboard-bridge:${discordClientId}:${discordClientSecret}`)
        .digest("hex");
}

const derivedDashboardBridgeSecret = deriveDashboardBridgeSecret();

module.exports = {
    token: process.env.DISCORD_TOKEN || requireEnv("BOT_TOKEN"),
    prefix: process.env.BOT_PREFIX || ">",
    ownerID: parseList(process.env.OWNER_IDS),
    SpotifyID: process.env.SPOTIFY_CLIENT_ID,
    SpotifySecret: process.env.SPOTIFY_CLIENT_SECRET,
    mongourl: process.env.MONGO_URI || requireEnv("MONGODB_URL"),
    color: /^#[0-9a-f]{6}$/i.test(process.env.BOT_COLOR || "") ? process.env.BOT_COLOR : "#00D4FF",
    logs: "",
    node_source: process.env.LAVALINK_SOURCE || "spsearch",

    dashboard: {
        clientId: discordClientId,
        clientSecret: discordClientSecret,
        nextAuthSecret: process.env.NEXTAUTH_SECRET,
        nextAuthUrl: dashboardUrl,
        botApiUrl: process.env.DASHBOARD_API_URL || "http://localhost:2000",
        bridgeSecret: derivedDashboardBridgeSecret,
    },

    links: {
        BG: "",
        support: process.env.SUPPORT_URL || supportServerUrl,
        invite: process.env.INVITE_URL || `https://discord.com/api/oauth2/authorize?client_id=${discordClientId}&permissions=8&scope=bot%20applications.commands`,
        Kreo: "Kreo",
        power: process.env.POWERED_BY_TEXT || "Powered by Kreo",
        vanity: process.env.SUPPORT_URL || supportServerUrl,
        guild: process.env.SUPPORT_GUILD_ID || process.env.COMMUNITY_GUILD_ID || "",
    },

    Webhooks: {
        black: process.env.BLACKLIST_WEBHOOK_URL || "",
        player_create: process.env.PLAYER_CREATE_WEBHOOK_URL || "",
        player_delete: process.env.PLAYER_DELETE_WEBHOOK_URL || "",
        guild_join: process.env.GUILD_JOIN_WEBHOOK_URL || "",
        guild_leave: process.env.GUILD_LEAVE_WEBHOOK_URL || "",
        cmdrun: process.env.COMMAND_WEBHOOK_URL || "",
    },

    nodes: [
        {
            name: process.env.LAVALINK_NAME || "Main Node",
            url: process.env.LAVALINK_URL || "localhost:2333",
            auth: process.env.LAVALINK_PASSWORD || "youshallnotpass",
            secure: parseBoolean(process.env.LAVALINK_SECURE)
        }
    ],

    node_options: {
        moveOnDisconnect: false,
        resume: true,
        resumeTimeout: 60,
        resumeByLibrary: true,
        reconnectTries: 5,
        reconnectInterval: 5,
        restTimeout: 60,
        voiceConnectionTimeout: 30,
        userAgent: "Kreo",
    },
};
