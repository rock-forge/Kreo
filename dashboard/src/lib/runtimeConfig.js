import crypto from "node:crypto";

function deriveBridgeSecret(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    return "";
  }

  return crypto
    .createHash("sha256")
    .update(`kreo-dashboard-bridge:${clientId}:${clientSecret}`)
    .digest("hex");
}

const dashboardClientId = process.env.DISCORD_CLIENT_ID || "";
const dashboardClientSecret = process.env.DISCORD_CLIENT_SECRET || "";
const dashboardUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

export const runtimeConfig = {
  dashboard: {
    clientId: dashboardClientId,
    clientSecret: dashboardClientSecret,
    nextAuthSecret: process.env.NEXTAUTH_SECRET || "",
    nextAuthUrl: dashboardUrl,
    botApiUrl: process.env.DASHBOARD_API_URL || "http://localhost:2000",
    socketUrl: process.env.DASHBOARD_SOCKET_URL || process.env.DASHBOARD_API_URL || "http://localhost:2000",
    bridgeSecret: process.env.DASHBOARD_BRIDGE_SECRET || deriveBridgeSecret(dashboardClientId, dashboardClientSecret),
  },
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URL || "",
};
