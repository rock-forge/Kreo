const EVENT = "kreo:room-preferences";
const ID = /^\d{17,20}$/;
const memory = new Map();
const blocked = new Set();

function keyFor(userId) {
  return typeof userId === "string" && ID.test(userId) ? `kreo:rooms:v1:${userId}` : "";
}
function ids(value, limit) {
  return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === "string" && ID.test(item)))].slice(0, limit) : [];
}
export function parseRoomPreferences(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    return { pinned: ids(value?.pinned, 200), recent: ids(value?.recent, 5) };
  } catch { return { pinned: [], recent: [] }; }
}
export function roomPreferencesSnapshot(userId) {
  const key = keyFor(userId);
  if (!key || typeof window === "undefined") return "";
  if (blocked.has(key)) return memory.get(key) || "";
  try { return window.localStorage.getItem(key) || ""; }
  catch { return memory.get(key) || ""; }
}
export function subscribeRoomPreferences(onChange) {
  function changed(event) {
    if (event.type === "storage") {
      if (event.key) { blocked.delete(event.key); memory.delete(event.key); }
      else { blocked.clear(); memory.clear(); }
    }
    onChange();
  }
  window.addEventListener(EVENT, changed);
  window.addEventListener("storage", changed);
  return () => { window.removeEventListener(EVENT, changed); window.removeEventListener("storage", changed); };
}
export function emptyRoomPreferencesSnapshot() { return ""; }
function update(userId, guildId, transform) {
  const key = keyFor(userId);
  if (!key || typeof guildId !== "string" || !ID.test(guildId) || typeof window === "undefined") return { updated: false, persisted: false };
  const value = transform(parseRoomPreferences(roomPreferencesSnapshot(userId)));
  const raw = JSON.stringify({ pinned: ids(value.pinned, 200), recent: ids(value.recent, 5) });
  memory.set(key, raw);
  let persisted = true;
  try { window.localStorage.setItem(key, raw); blocked.delete(key); }
  catch { persisted = false; blocked.add(key); }
  window.dispatchEvent(new Event(EVENT));
  return { updated: true, persisted };
}
export function toggleRoomPin(userId, guildId) {
  return update(userId, guildId, value => ({ ...value, pinned: value.pinned.includes(guildId) ? value.pinned.filter(id => id !== guildId) : [guildId, ...value.pinned] }));
}
export function recordRoomVisit(userId, guildId) {
  return update(userId, guildId, value => ({ ...value, recent: [guildId, ...value.recent.filter(id => id !== guildId)] }));
}
