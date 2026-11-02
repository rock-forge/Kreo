const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../dashboard/src/lib/roomPreferences.js'), 'utf8')
  .replace(/export function /g, 'function ');
const exportsExpression = ';({parseRoomPreferences,roomPreferencesSnapshot,subscribeRoomPreferences,emptyRoomPreferencesSnapshot,toggleRoomPin,recordRoomVisit})';
const owner = '688715932247261234';
const otherOwner = '588715932247261234';
const room = '123456789012345678';
const otherRoom = '223456789012345678';
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(store = new Map()) {
  const state = { readFails: false, writeFails: false, storageDenied: false, writes: 0 };
  const window = new EventTarget();
  const localStorage = {
    getItem(key) { if (state.readFails) throw new Error('Read unavailable'); return store.get(key) ?? null; },
    setItem(key, value) { if (state.writeFails) throw new Error('Write unavailable'); state.writes++; store.set(key, value); },
  };
  Object.defineProperty(window, 'localStorage', { get() {
    if (state.storageDenied) throw new Error('Storage unavailable');
    return localStorage;
  } });
  const preferences = vm.runInNewContext(source + exportsExpression, { window, Event });
  return { preferences, store, state, window,
    read(user = owner) { return plain(preferences.parseRoomPreferences(preferences.roomPreferencesSnapshot(user))); },
    storageEvent(key) {
      const event = new Event('storage');
      Object.defineProperty(event, 'key', { value: key });
      window.dispatchEvent(event);
    },
  };
}

test('room preferences ignore malformed data and invalid or duplicate IDs while bounding stored lists', () => {
  const { preferences } = fixture();
  for (const raw of ['', '{broken', 'null', '12', '"text"', '[]']) {
    assert.deepEqual(plain(preferences.parseRoomPreferences(raw)), { pinned: [], recent: [] });
  }
  const rooms = Array.from({ length: 205 }, (_, i) => String(323456789012345678n + BigInt(i)));
  const raw = JSON.stringify({
    pinned: ['../../other-user', 123456789012345678, '1', '1'.repeat(21), null, rooms[0], ...rooms],
    recent: [false, rooms[0], rooms[0], ...rooms],
  });
  const parsed = plain(preferences.parseRoomPreferences(raw));
  assert.deepEqual(parsed.pinned, rooms.slice(0, 200));
  assert.deepEqual(parsed.recent, rooms.slice(0, 5));
  assert.deepEqual(plain(preferences.parseRoomPreferences(JSON.stringify({ pinned: {}, recent: 'not a list' }))), { pinned: [], recent: [] });
});

test('pin toggles persist once, notify the current page, and reject invalid account or room IDs', () => {
  const f = fixture();
  let notifications = 0;
  const unsubscribe = f.preferences.subscribeRoomPreferences(() => notifications++);
  for (const [userId, guildId] of [['', room], ['../other', room], [owner, 'bad'], [owner, 123456789012345678]]) {
    assert.deepEqual(plain(f.preferences.toggleRoomPin(userId, guildId)), { updated: false, persisted: false });
  }
  assert.equal(f.state.writes, 0);
  assert.equal(notifications, 0);
  assert.deepEqual(plain(f.preferences.toggleRoomPin(owner, room)), { updated: true, persisted: true });
  assert.deepEqual(f.read(), { pinned: [room], recent: [] });
  assert.equal(f.state.writes, 1);
  assert.equal(notifications, 1);
  assert.equal(f.preferences.roomPreferencesSnapshot(owner), [...f.store.values()][0]);
  f.preferences.toggleRoomPin(owner, room);
  assert.deepEqual(f.read(), { pinned: [], recent: [] });
  assert.equal(notifications, 2);
  unsubscribe();
  f.preferences.toggleRoomPin(owner, room);
  assert.equal(notifications, 2, 'unmounted subscribers must not receive updates');
});

test('pins and recent rooms stay isolated per Discord account and survive a new page instance', () => {
  const f = fixture();
  f.preferences.toggleRoomPin(owner, room);
  f.preferences.recordRoomVisit(owner, room);
  f.preferences.toggleRoomPin(otherOwner, otherRoom);
  f.preferences.recordRoomVisit(otherOwner, otherRoom);
  assert.equal(f.store.size, 2);
  assert.deepEqual(f.read(), { pinned: [room], recent: [room] });
  assert.deepEqual(f.read(otherOwner), { pinned: [otherRoom], recent: [otherRoom] });
  const reloaded = fixture(f.store);
  assert.deepEqual(reloaded.read(), { pinned: [room], recent: [room] });
  assert.deepEqual(reloaded.read(otherOwner), { pinned: [otherRoom], recent: [otherRoom] });
  reloaded.preferences.toggleRoomPin(owner, room);
  assert.deepEqual(reloaded.read(otherOwner), { pinned: [otherRoom], recent: [otherRoom] });
});

test('recent rooms keep the five most recent distinct visits in order without changing pins', () => {
  const f = fixture();
  const rooms = Array.from({ length: 7 }, (_, i) => String(423456789012345678n + BigInt(i)));
  f.preferences.toggleRoomPin(owner, room);
  rooms.forEach(id => f.preferences.recordRoomVisit(owner, id));
  assert.deepEqual(f.read(), { pinned: [room], recent: rooms.slice(2).reverse() });
  f.preferences.recordRoomVisit(owner, rooms[4]);
  assert.deepEqual(f.read(), { pinned: [room], recent: [rooms[4], rooms[6], rooms[5], rooms[3], rooms[2]] });
  f.preferences.recordRoomVisit(owner, rooms[4]);
  assert.deepEqual(f.read().recent, [rooms[4], rooms[6], rooms[5], rooms[3], rooms[2]]);
  assert.deepEqual(plain(f.preferences.recordRoomVisit(owner, 'https://attacker.invalid/room')), { updated: false, persisted: false });
  assert.deepEqual(f.read().recent, [rooms[4], rooms[6], rooms[5], rooms[3], rooms[2]]);
});

test('blocked storage keeps pins and recents usable during the visit and can persist them when storage returns', () => {
  const f = fixture();
  f.state.storageDenied = true;
  assert.deepEqual(plain(f.preferences.toggleRoomPin(owner, room)), { updated: true, persisted: false });
  assert.deepEqual(plain(f.preferences.recordRoomVisit(owner, otherRoom)), { updated: true, persisted: false });
  assert.deepEqual(f.read(), { pinned: [room], recent: [otherRoom] });
  assert.deepEqual(f.read(otherOwner), { pinned: [], recent: [] });
  assert.equal(f.store.size, 0);
  f.state.storageDenied = false;
  assert.deepEqual(plain(f.preferences.recordRoomVisit(owner, room)), { updated: true, persisted: true });
  assert.deepEqual(f.read(), { pinned: [room], recent: [room, otherRoom] });
  const reloaded = fixture(f.store);
  assert.deepEqual(reloaded.read(), { pinned: [room], recent: [room, otherRoom] });
  f.state.readFails = true;
  assert.deepEqual(f.read(), { pinned: [room], recent: [room, otherRoom] }, 'a later read failure must retain the session state');
});

test('storage events replace a blocked-write fallback with another tab’s data and clear removed preferences', () => {
  const f = fixture();
  f.preferences.toggleRoomPin(owner, room);
  const key = [...f.store.keys()][0];
  f.state.writeFails = true;
  f.preferences.toggleRoomPin(owner, otherRoom);
  assert.deepEqual(f.read().pinned, [otherRoom, room]);
  let notifications = 0;
  const unsubscribe = f.preferences.subscribeRoomPreferences(() => notifications++);
  f.state.writeFails = false;
  f.store.set(key, JSON.stringify({ pinned: [otherRoom], recent: [otherRoom] }));
  f.storageEvent(key);
  assert.deepEqual(f.read(), { pinned: [otherRoom], recent: [otherRoom] });
  assert.equal(notifications, 1);
  f.state.writeFails = true;
  f.preferences.toggleRoomPin(owner, room);
  assert.deepEqual(f.read().pinned, [room, otherRoom]);
  f.store.clear();
  f.storageEvent(null);
  assert.deepEqual(f.read(), { pinned: [], recent: [] });
  assert.equal(notifications, 3);
  unsubscribe();
});

test('server rendering has an empty stable snapshot and never attempts a browser write', () => {
  const preferences = vm.runInNewContext(source + exportsExpression, { Event });
  assert.equal(preferences.emptyRoomPreferencesSnapshot(), '');
  assert.equal(preferences.roomPreferencesSnapshot(owner), '');
  assert.deepEqual(plain(preferences.toggleRoomPin(owner, room)), { updated: false, persisted: false });
  assert.deepEqual(plain(preferences.recordRoomVisit(owner, room)), { updated: false, persisted: false });
});
