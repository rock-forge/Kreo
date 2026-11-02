const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once, EventEmitter } = require('node:events');
const { WebSocketServer } = require('ws');
const { Shoukaku, Connector, Node, Player, Rest, RestError, Constants } = require('shoukaku');
const { expiredSessionId, recoverLavalinkSession, sessionRecoveryStructures } = require('../src/utils/lavalinkSessionRecovery');
const { State } = Constants;
const guildId = '1421686119338213548';

function sessionError(session = 'old-session', overrides = {}) {
  return new RestError({ timestamp: Date.now(), status: 404, error: 'Not Found', message: 'Session not found', path: `/v4/sessions/${session}/players/${guildId}`, ...overrides });
}

function fixture() {
  const shoukaku = new EventEmitter();
  shoukaku.nodes = new Map();
  shoukaku.players = new Map();
  shoukaku.connections = new Map();
  shoukaku.options = { restTimeout: 2, userAgent: 'Kreo local regression test' };
  const logs = [], disconnects = [], errors = [];
  shoukaku.on('error', (...args) => errors.push(args));
  const client = { manager: { shoukaku, players: new Map() }, logger: { log: (...args) => logs.push(args) } };
  const node = { name: 'test-node', manager: shoukaku, sessionId: 'old-session', state: State.CONNECTED,
    disconnect(...args) { disconnects.push(args); this.state = State.DISCONNECTING; },
  };
  shoukaku.nodes.set(node.name, node);
  return { client, shoukaku, node, logs, disconnects, errors };
}

async function localServer(t, handler, beforeClose) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await beforeClose?.();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, address: `127.0.0.1:${server.address().port}` };
}

function reply(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

test('only confirmed Lavalink session 404 paths qualify for session recovery', () => {
  for (const path of [`/v4/sessions/old-session/players/${guildId}`, '/v4/sessions/old-session/players', '/v4/sessions/old-session']) {
    assert.equal(expiredSessionId(sessionError('old-session', { path })), 'old-session');
  }
  for (const error of [null, new Error('Session not found'), sessionError('old-session', { status: 500 }), sessionError('old-session', { message: {} }), sessionError('old-session', { message: 42 }), sessionError('old-session', { message: 'Track not found' }),
    sessionError('old-session', { path: '/v4/loadtracks' }), sessionError('old-session', { path: '/v4/sessions/old-session/players/not-a-guild' }),
    sessionError('old-session', { path: '/v4/sessions/old-session/players/' + guildId + '/unrelated' })]) {
    assert.equal(expiredSessionId(error), null);
  }
});

test('concurrent errors reconnect a matching node once while retaining queued and paused players', async () => {
  const f = fixture();
  const lower = { guildId, paused: true, position: 42000, track: 'encoded-track' };
  const queue = [{ title: 'Up next', uri: 'https://example.invalid/song' }];
  const upper = { guildId, paused: true, queue, shoukaku: lower };
  const connection = { channelId: '2421686119338213548', sessionId: 'discord-session' };
  f.shoukaku.players.set(guildId, lower);
  f.shoukaku.connections.set(guildId, connection);
  f.client.manager.players.set(guildId, upper);
  const result = await Promise.all(Array.from({ length: 8 }, () => Promise.resolve().then(() => recoverLavalinkSession(f.client, sessionError(), f.node.name))));
  assert.ok(result.every(Boolean));
  assert.equal(f.disconnects.length, 1);
  assert.equal(f.node.sessionId, null);
  assert.equal(f.shoukaku.players.get(guildId), lower);
  assert.equal(f.shoukaku.connections.get(guildId), connection);
  assert.equal(f.client.manager.players.get(guildId), upper);
  assert.equal(upper.queue, queue);
  assert.equal(upper.paused, true);
  assert.equal(lower.position, 42000);
});

test('late session errors cannot invalidate a replacement session or another node', () => {
  const f = fixture();
  const other = { ...f.node, name: 'other-node', sessionId: 'other-session' };
  f.shoukaku.nodes.set(other.name, other);
  f.node.sessionId = 'fresh-session';
  assert.equal(recoverLavalinkSession(f.client, sessionError(), f.node), true);
  assert.equal(recoverLavalinkSession(f.client, sessionError()), true);
  assert.equal(f.node.sessionId, 'fresh-session');
  assert.equal(other.sessionId, 'other-session');
  assert.equal(f.disconnects.length, 0);
  assert.equal(recoverLavalinkSession(f.client, sessionError('fresh-session')), true);
  assert.equal(f.node.sessionId, null);
  assert.equal(other.sessionId, 'other-session');
  assert.equal(f.disconnects.length, 1);
});

test('an error from a removed node cannot reset its replacement with the same name and session', () => {
  const f = fixture();
  const replacement = { ...f.node };
  f.shoukaku.nodes.set(replacement.name, replacement);
  assert.equal(recoverLavalinkSession(f.client, sessionError(), f.node), true);
  assert.equal(replacement.sessionId, 'old-session');
  assert.equal(f.node.sessionId, 'old-session');
  assert.equal(f.disconnects.length, 0);
});

test('repeated newly expired sessions are retried after backoff without a reconnect storm', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture();
  recoverLavalinkSession(f.client, sessionError(), f.node);
  f.node.state = State.CONNECTED;
  f.node.sessionId = 'next-expired-session';
  for (let count = 0; count < 5; count++) recoverLavalinkSession(f.client, sessionError('next-expired-session'), f.node);
  assert.equal(f.disconnects.length, 1);
  t.mock.timers.tick(4999);
  assert.equal(f.disconnects.length, 1);
  t.mock.timers.tick(1);
  assert.equal(f.disconnects.length, 2);
  assert.equal(f.node.sessionId, null);
});

test('a delayed recovery cannot reset a healthy session that replaced the failed session during backoff', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture();
  recoverLavalinkSession(f.client, sessionError(), f.node);
  f.node.state = State.CONNECTED;
  f.node.sessionId = 'next-expired-session';
  recoverLavalinkSession(f.client, sessionError('next-expired-session'), f.node);
  f.node.sessionId = 'healthy-replacement-session';
  recoverLavalinkSession(f.client, sessionError(), f.node);
  recoverLavalinkSession(f.client, sessionError('next-expired-session'), f.node);
  t.mock.timers.tick(5000);
  assert.equal(f.disconnects.length, 1);
  assert.equal(f.node.sessionId, 'healthy-replacement-session');
  assert.equal(f.node.state, State.CONNECTED);
});

test('unrelated errors do not change the node and registered voice-update errors are forwarded', async () => {
  const f = fixture();
  const error = sessionError('old-session', { message: 'Player not found' });
  assert.equal(recoverLavalinkSession(f.client, error, f.node), false);
  class FailingPlayer extends Player { async sendServerUpdate() { throw error; } }
  const structures = sessionRecoveryStructures(f.client, { player: FailingPlayer });
  const player = new structures.player(guildId, f.node);
  f.shoukaku.players.set(guildId, player);
  await assert.doesNotReject(player.sendServerUpdate({}));
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0][0], f.node.name);
  assert.equal(f.errors[0][1], error);
  assert.equal(f.node.sessionId, 'old-session');
  assert.equal(f.disconnects.length, 0);
});

test('custom Shoukaku structures are preserved and initial failed voice joins still reject', async () => {
  const f = fixture();
  const error = sessionError();
  class ExistingRest extends Rest { async fetch() { throw error; } }
  class ExistingPlayer extends Player { async sendServerUpdate() { throw error; } }
  const structures = sessionRecoveryStructures(f.client, { rest: ExistingRest, player: ExistingPlayer, connection: 'fixture-extension' });
  const player = new structures.player(guildId, f.node);
  const rest = new structures.rest(f.node, { url: '127.0.0.1:1', auth: 'fixture-only' });
  assert.ok(rest instanceof ExistingRest);
  assert.ok(player instanceof ExistingPlayer);
  assert.equal(structures.connection, 'fixture-extension');
  await assert.rejects(player.sendServerUpdate({}), value => value === error);
  await assert.rejects(rest.fetch({}), value => value === error);
  assert.equal(f.disconnects.length, 1);
});

test('actual Shoukaku REST errors trigger recovery but remain visible to the original caller', async t => {
  const f = fixture();
  const requests = [];
  const { address } = await localServer(t, (req, res) => {
    requests.push(req.url);
    reply(res, { status: 404, error: 'Not Found', message: 'Session not found', path: req.url.split('?')[0] }, 404);
  });
  const structures = sessionRecoveryStructures(f.client);
  f.node.rest = new structures.rest(f.node, { url: address, secure: false, auth: 'fixture-only' });
  await assert.rejects(f.node.rest.updatePlayer({ guildId, playerOptions: { paused: true } }), error => {
    assert.ok(error instanceof RestError);
    assert.equal(error.status, 404);
    assert.equal(error.message, 'Session not found');
    return true;
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0], new RegExp(`/v4/sessions/old-session/players/${guildId}`));
  assert.equal(f.disconnects.length, 1);
  assert.equal(f.node.sessionId, null);
});

test('actual registered Shoukaku Player voice updates consume session expiry without an unhandled rejection', async t => {
  const f = fixture();
  const { address } = await localServer(t, (req, res) => reply(res, { status: 404, error: 'Not Found', message: 'Session not found', path: req.url.split('?')[0] }, 404));
  const structures = sessionRecoveryStructures(f.client);
  f.node.rest = new structures.rest(f.node, { url: address, auth: 'fixture-only' });
  const player = new structures.player(guildId, f.node);
  f.shoukaku.players.set(guildId, player);
  const connection = { serverUpdate: { token: 'fixture-token', endpoint: 'fixture.invalid' }, sessionId: 'discord-session', channelId: '2421686119338213548' };
  await assert.doesNotReject(player.sendServerUpdate(connection));
  assert.equal(f.disconnects.length, 1);
  assert.equal(f.errors.length, 0);
  assert.equal(f.shoukaku.players.get(guildId), player);
});

test('real local Lavalink websocket reconnect obtains a fresh session and resumes a retained paused player', { timeout: 10000 }, async t => {
  const requests = [], handshakes = [], errors = [];
  let expired = false;
  let disposeWebsocket;
  const { server, address } = await localServer(t, async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const path = req.url.split('?')[0];
    requests.push({ path, body });
    if (expired && path.startsWith('/v4/sessions/old-session/players/')) return reply(res, { status: 404, error: 'Not Found', message: 'Session not found', path }, 404);
    reply(res, {});
  }, () => disposeWebsocket?.());
  const websocket = new WebSocketServer({ server, path: '/v4/websocket' });
  websocket.on('connection', (socket, req) => {
    handshakes.push(req.headers['session-id']);
    socket.send(JSON.stringify({ op: 'ready', resumed: false, sessionId: handshakes.length === 1 ? 'old-session' : 'fresh-session' }));
  });
  class LocalConnector extends Connector { getId() { return '3421686119338213548'; } sendPacket() {} listen() {} }
  const client = { manager: null, logger: { log() {} } };
  const manager = new Shoukaku(new LocalConnector({}), [], {
    resume: true, resumeByLibrary: true, resumeTimeout: 60, reconnectTries: 1, reconnectInterval: 0,
    restTimeout: 2, voiceConnectionTimeout: 2, moveOnDisconnect: false,
    structures: sessionRecoveryStructures(client),
  });
  manager.id = '3421686119338213548';
  manager.on('error', (...args) => errors.push(args));
  client.manager = { shoukaku: manager, players: new Map() };
  const node = new Node(manager, { name: 'local-lavalink', url: address, secure: false, auth: 'fixture-only' });
  manager.nodes.set(node.name, node);
  node.on('error', error => manager.emit('error', node.name, error));
  disposeWebsocket = async () => {
    node.ws?.removeAllListeners();
    node.ws?.terminate();
    node.ws = null;
    node.state = State.DISCONNECTED;
    for (const socket of websocket.clients) socket.terminate();
    await new Promise(resolve => websocket.close(resolve));
  };
  const firstReady = once(node, 'ready');
  await node.connect();
  await firstReady;
  assert.equal(node.sessionId, 'old-session');
  const connection = { channelId: '2421686119338213548', sessionId: 'discord-session', serverUpdate: { token: 'fixture-token', endpoint: 'fixture.invalid' } };
  manager.connections.set(guildId, connection);
  const player = new manager.options.structures.player(guildId, node);
  player.track = 'fixture-encoded-track'; player.paused = true; player.position = 42000; player.volume = 37;
  manager.players.set(guildId, player);
  const queue = [{ title: 'Keep this queued song' }];
  const upper = { guildId, queue, paused: true, shoukaku: player };
  client.manager.players.set(guildId, upper);
  expired = true;
  const resumed = once(player, 'resumed');
  const freshReady = once(node, 'ready');
  await player.sendServerUpdate(connection);
  await Promise.all([resumed, freshReady]);
  assert.equal(node.sessionId, 'fresh-session');
  assert.equal(handshakes.length, 2);
  assert.equal(handshakes[1], undefined, 'Expired Session-Id must not be requested in the new handshake');
  const replay = requests.find(request => request.path === `/v4/sessions/fresh-session/players/${guildId}`);
  assert.ok(replay, 'Retained player must be recreated in the fresh Lavalink session');
  assert.equal(replay.body.track.encoded, 'fixture-encoded-track');
  assert.equal(replay.body.paused, true);
  assert.equal(replay.body.position, 42000);
  assert.equal(replay.body.volume, 37);
  assert.equal(manager.players.get(guildId), player);
  assert.equal(manager.connections.get(guildId), connection);
  assert.equal(client.manager.players.get(guildId), upper);
  assert.equal(upper.queue, queue);
  assert.equal(player.paused, true);
  assert.equal(errors.length, 0);
});
