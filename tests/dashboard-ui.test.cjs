const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../dashboard/src');

test('track metadata cannot leak artwork, duration or requester between different tracks with the same title', () => {
  const source = fs.readFileSync(path.join(root, 'lib/playerMetadata.js'), 'utf8').replace(/export function /g, 'function ');
  const { mergeTrackMetadata, sameTrack } = vm.runInNewContext(source + '\n;({mergeTrackMetadata, sameTrack})', {});
  const cached = { uri: 'https://example.com/old', title: 'Intro', author: 'Artist A', length: 50000, thumbnail: 'old.png', requester: 'Old listener' };
  const live = { uri: 'https://example.com/new', title: 'Intro', author: 'Artist B' };
  assert.equal(sameTrack(live, cached), false);
  const merged = mergeTrackMetadata(live, cached);
  assert.equal(merged.thumbnail, null);
  assert.equal(merged.length, 0);
  assert.equal(merged.requester, 'Unknown user');
  const restored = mergeTrackMetadata({ ...cached, length: 0, thumbnail: null, requester: null }, cached);
  assert.equal(restored.thumbnail, 'old.png');
  assert.equal(restored.length, 50000);
  assert.equal(restored.requester, 'Old listener');
  assert.equal(sameTrack({ title: 'Intro', author: 'Artist B' }, cached), false);
});

test('invite uses the runtime application ID and rejects malformed guild IDs', async () => {
  const source = fs.readFileSync(path.join(root, 'app/api/invite/route.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export const /g, 'const ').replace(/export async function /g, 'async function ');
  const runtimeConfig = { dashboard: { clientId: '1013423895069589565' } };
  const GET = vm.runInNewContext(source + '\n;GET;', { runtimeConfig, URL, NextResponse: { json: (data, options) => ({ data, ...options }), redirect: (url, options) => ({ url: String(url), ...options }) } });
  const response = await GET({ url: 'https://music.zenithh.online/api/invite?guildId=123456789012345678' });
  const destination = new URL(response.url);
  assert.equal(destination.origin, 'https://discord.com');
  assert.equal(destination.searchParams.get('client_id'), runtimeConfig.dashboard.clientId);
  assert.equal(destination.searchParams.get('guild_id'), '123456789012345678');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal((await GET({ url: 'https://music.zenithh.online/api/invite?guildId=../../attacker' })).status, 400);
  runtimeConfig.dashboard.clientId = '';
  assert.equal((await GET({ url: 'https://music.zenithh.online/api/invite' })).status, 503);
});
