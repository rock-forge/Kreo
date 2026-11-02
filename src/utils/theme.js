const THEME = Object.freeze({
  accent: 0xA78BFA,
  primary: 0x8B5CF6,
  background: "#171121",
  surface: "#241A38",
  text: "#F5F0FF",
  muted: "#C4B5D6",
});

function resolveBotColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  // Migrate the old shipped neutral color without overwriting .env secrets.
  if (!/^#[0-9a-f]{6}$/i.test(color) || color.toLowerCase() === "#3f4652") return "#A78BFA";
  return color;
}

module.exports = { THEME, resolveBotColor };
