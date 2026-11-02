const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { KazagumoPlayer, PlayerState } = require('kazagumo');
const { State } = require('shoukaku').Constants;

async function runPlay({ age = 360000, playing = false, paused = false, refreshError = false, useMonitorTime = false } = {}) {
  const filename = path.resolve(__dirname, '../src/commands/Music/play.js');
  const realRequire = createRequire(filename);
  const errors = [], imports = [], packets = [], actions = [], replies = [];
  const context = { module: { exports: {} }, console: { log() {}, error: (...args) => errors.push(args) }, setTimeout, clearTimeout,
    require(name) {
      imports.push(name);
      if (name === '../../schema/userpreferences') return { findOne: async () => null };
      if (name === '@discordjs/voice') throw new Error('This bot uses Kazagumo voice connections');
      return realRequire(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const queue = [];
  Object.defineProperty(queue, 'size', { get: () => queue.length });
  queue.add = track => queue.push(track);
  const initialActivity = Date.now() - age;
  const player = {
    guildId: '123456789012345678', voiceId: '223456789012345678', textId: '323456789012345678',
    options: { deaf: true }, state: PlayerState.CONNECTED, playing, paused, queue,
    data: new Map([[useMonitorTime ? 'monitorStartTime' : 'lastActivityTime', initialActivity]]),
    kazagumo: { KazagumoOptions: { send(guildId, payload) { actions.push('refresh'); packets.push({ guildId, payload }); } } },
    emit() {},
    setVoiceChannel: refreshError ? () => { throw new Error('Fixture refresh failure'); } : KazagumoPlayer.prototype.setVoiceChannel,
    search: async () => ({ type: 'SEARCH', tracks: [{ title: 'Test song', author: 'Test artist', uri: 'https://example.com/song', identifier: 'test-song', thumbnail: 'https://example.com/cover.png', length: 180000 }] }),
    play: async () => { actions.push('play'); },
    destroy: async () => { actions.push('destroy'); },
  };
  const reply = async body => { for (const component of body.components) component.toJSON(); replies.push(body); return null; };
  const message = { author: { id: '423456789012345678', username: 'Listener' },
    member: { voice: { channel: { id: player.voiceId } } },
    guild: { id: player.guildId, members: { me: { permissions: { has: () => true } } } },
    channel: { id: player.textId, send: reply }, reply,
  };
  const client = { emoji: { check: '✅', cross: '❌', warn: '⚠️', info: 'ℹ️' }, logger: { log() {} },
    manager: { players: new Map([[player.guildId, player]]), shoukaku: { nodes: new Map([['online', { state: State.CONNECTED }]]) } },
  };
  await context.module.exports.execute(message, ['test song'], client, '.');
  return { player, imports, packets, actions, errors, replies, initialActivity };
}

test('playing after prolonged idle refreshes the actual Kazagumo connection before playback', async () => {
  const result = await runPlay();
  assert.deepEqual(result.actions, ['refresh', 'play']);
  assert.equal(result.imports.includes('@discordjs/voice'), false);
  assert.equal(result.errors.length, 0);
  assert.equal(result.replies.length, 1);
  assert.equal(result.player.queue.length, 1);
  assert.ok(result.player.data.get('lastActivityTime') > result.initialActivity);
  assert.deepEqual(result.packets, [{ guildId: result.player.guildId, payload: { op: 4, d: {
    guild_id: result.player.guildId, channel_id: result.player.voiceId, self_mute: false, self_deaf: true,
  } } }]);
});

test('fresh, active and paused players do not get an unnecessary voice refresh', async () => {
  for (const options of [{ age: 1000 }, { playing: true }, { paused: true }]) {
    const result = await runPlay(options);
    assert.equal(result.packets.length, 0);
    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.actions, options.playing || options.paused ? [] : ['play']);
  }
});

test('an idle player without an activity record uses its monitor start time', async () => {
  const result = await runPlay({ useMonitorTime: true });
  assert.deepEqual(result.actions, ['refresh', 'play']);
  assert.equal(result.errors.length, 0);
  assert.ok(result.player.data.has('lastActivityTime'));
});

test('a failed voice refresh is reported without preventing the queued song from playing', async () => {
  const result = await runPlay({ refreshError: true });
  assert.deepEqual(result.actions, ['play']);
  assert.equal(result.player.data.get('lastActivityTime'), result.initialActivity);
  assert.equal(result.errors.length, 1);
  assert.match(String(result.errors[0][1]), /Fixture refresh failure/);
});
