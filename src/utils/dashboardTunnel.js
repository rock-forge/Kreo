const fs = require("node:fs");
const net = require("node:net");
const { Client } = require("ssh2");

// The bot opens this connection outward; only loopback on the VPS can reach the bridge.
function startDashboardTunnel({ localPort, env = process.env, logger = console }) {
  if (env.DASHBOARD_TUNNEL_ENABLED !== "true") return { close() {} };

  const host = env.DASHBOARD_TUNNEL_HOST;
  const username = env.DASHBOARD_TUNNEL_USER;
  const hostHash = String(env.DASHBOARD_TUNNEL_HOST_SHA256 || "").replace(/^SHA256:/, "");
  const remotePort = Number(env.DASHBOARD_TUNNEL_REMOTE_PORT || 2000);
  const sshPort = Number(env.DASHBOARD_TUNNEL_SSH_PORT || 22);
  const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
  if (!host || !username || !/^[A-Za-z0-9+/]{43}=?$/.test(hostHash) ||
      !env.DASHBOARD_TUNNEL_KEY_PATH || !validPort(remotePort) || !validPort(sshPort) || !validPort(localPort)) {
    throw new Error("Dashboard tunnel configuration is incomplete or invalid.");
  }
  const privateKey = fs.readFileSync(env.DASHBOARD_TUNNEL_KEY_PATH);
  const log = message => (logger.system || logger.log).call(logger, message);
  let client;
  let retry;
  let stopped = false;
  let attempts = 0;
  const connections = new Set();

  function connect() {
    if (stopped) return;
    const current = new Client();
    client = current;
    current.on("ready", () => {
      current.forwardIn("127.0.0.1", remotePort, error => {
        if (error) {
          log("Dashboard tunnel could not open its private port; reconnecting.");
          current.end();
          return;
        }
        attempts = 0;
        log("Dashboard private tunnel connected.");
      });
    });
    current.on("tcp connection", (details, accept, reject) => {
      if (stopped || details.destIP !== "127.0.0.1" || details.destPort !== remotePort) {
        reject();
        return;
      }
      const channel = accept();
      const local = net.connect({ host: "127.0.0.1", port: localPort });
      connections.add(local);
      connections.add(channel);
      local.on("error", () => channel.destroy());
      channel.on("error", () => local.destroy());
      local.on("close", () => { connections.delete(local); channel.destroy(); });
      channel.on("close", () => { connections.delete(channel); local.destroy(); });
      local.pipe(channel).pipe(local);
    });
    current.on("error", () => {
      log("Dashboard tunnel connection unavailable; reconnecting.");
      current.destroy();
    });
    current.on("close", () => {
      for (const connection of connections) connection.destroy();
      connections.clear();
      if (stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5));
      retry = setTimeout(connect, delay);
      retry.unref();
    });
    current.connect({
      host, port: sshPort, username, privateKey,
      readyTimeout: 20_000, keepaliveInterval: 15_000, keepaliveCountMax: 3,
      hostHash: "sha256",
      hostVerifier: hash => Buffer.from(hash, "hex").toString("base64").replace(/=+$/, "") === hostHash.replace(/=+$/, ""),
    });
  }
  connect();
  return {
    close() {
      stopped = true;
      clearTimeout(retry);
      for (const connection of connections) connection.destroy();
      client?.destroy();
    },
  };
}

module.exports = { startDashboardTunnel };
