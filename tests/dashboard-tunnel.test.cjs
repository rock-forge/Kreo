const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const { Server, utils } = require("ssh2");
const { startDashboardTunnel } = require("../src/utils/dashboardTunnel");

test("the private tunnel requires a pinned host key and stays disabled by default", () => {
  assert.doesNotThrow(() => startDashboardTunnel({ env: {} }).close());
  assert.throws(() => startDashboardTunnel({ localPort: 2000, env: { DASHBOARD_TUNNEL_ENABLED: "true" } }), /incomplete or invalid/);
});

test("the tunnel forwards real TCP traffic through an authenticated SSH session", { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kreo-tunnel-test-"));
  const hostKeys = utils.generateKeyPairSync("ed25519");
  const clientKeys = utils.generateKeyPairSync("ed25519");
  const expectedClientKey = utils.parseKey(clientKeys.public).getPublicSSH();
  const hostHash = crypto.createHash("sha256").update(utils.parseKey(hostKeys.public).getPublicSSH()).digest("base64");
  const keyPath = path.join(directory, "key");
  fs.writeFileSync(keyPath, clientKeys.private);
  const echo = net.createServer(socket => socket.pipe(socket));
  let forwarding;
  let session;
  let tunnel;
  let remoteSocket;
  let forwardedSocket;
  const ssh = new Server({ hostKeys: [hostKeys.private] }, client => {
    session = client;
    client.on("error", () => {});
    client.on("authentication", context => {
      if (context.username !== "test-tunnel" || context.method !== "publickey" ||
          !context.key.data.equals(expectedClientKey) ||
          (context.signature && !utils.parseKey(clientKeys.public).verify(context.blob, context.signature, context.hashAlgo))) return context.reject();
      context.accept();
    });
    client.on("ready", () => client.on("request", (accept, reject, name, info) => {
      if (name !== "tcpip-forward" || info.bindAddr !== "127.0.0.1") return reject();
      forwarding = net.createServer(socket => {
        forwardedSocket = socket;
        client.forwardOut(info.bindAddr, info.bindPort, socket.remoteAddress, socket.remotePort, (error, channel) => {
          if (error) return socket.destroy();
          socket.pipe(channel).pipe(socket);
          socket.on("error", () => channel.destroy());
          channel.on("error", () => socket.destroy());
        });
      }).listen(info.bindPort, "127.0.0.1", () => accept());
    }));
  });
  const portProbe = net.createServer();
  try {
    echo.listen(0, "127.0.0.1"); await once(echo, "listening");
    ssh.listen(0, "127.0.0.1"); await once(ssh, "listening");
    portProbe.listen(0, "127.0.0.1"); await once(portProbe, "listening");
    const remotePort = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    let connected;
    const ready = new Promise(resolve => { connected = resolve; });
    tunnel = startDashboardTunnel({ localPort: echo.address().port, env: {
      DASHBOARD_TUNNEL_ENABLED: "true", DASHBOARD_TUNNEL_HOST: "127.0.0.1", DASHBOARD_TUNNEL_USER: "test-tunnel",
      DASHBOARD_TUNNEL_KEY_PATH: keyPath, DASHBOARD_TUNNEL_HOST_SHA256: hostHash,
      DASHBOARD_TUNNEL_REMOTE_PORT: String(remotePort), DASHBOARD_TUNNEL_SSH_PORT: String(ssh.address().port),
    }, logger: { system(message) { if (message.endsWith("connected.")) connected(); } } });
    await ready;
    remoteSocket = net.connect(remotePort, "127.0.0.1");
    await once(remoteSocket, "connect");
    remoteSocket.write("kreo encrypted forwarding");
    const [received] = await once(remoteSocket, "data");
    assert.equal(received.toString(), "kreo encrypted forwarding");
  } finally {
    remoteSocket?.destroy(); forwardedSocket?.destroy(); tunnel?.close(); session?.end();
    forwarding?.close(); ssh.close(); echo.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
