const aliases = { load: "loading", suffle: "shuffle", like: "favourite" };
const prefixes = ["km_purple2_", "km_purple_", "sb_", ""];

function applyApplicationEmojis(target, emojis) {
  const byName = new Map([...emojis].map(emoji => [emoji.name, emoji]));
  let count = 0;
  for (const key of Object.keys(target)) {
    const suffix = aliases[key] || key;
    const emoji = prefixes.map(prefix => byName.get(prefix + suffix)).find(Boolean);
    if (!emoji || !/^\d{17,20}$/.test(emoji.id)) continue;
    target[key] = `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
    count++;
  }
  return count;
}

async function loadApplicationEmojis(client) {
  try {
    const emojis = await client.application.emojis.fetch();
    const count = applyApplicationEmojis(client.emoji, emojis.values());
    client.logger.log(`Application emojis loaded: ${count} UI icons.`, "event");
  } catch {
    client.logger.log("Application emojis could not be loaded; using standard icons.", "warn");
  }
}

module.exports = { applyApplicationEmojis, loadApplicationEmojis };
