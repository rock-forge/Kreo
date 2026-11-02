const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const applicationEmojis = require("../emojis");
const { THEME } = require("./theme");

const COLORS = Object.freeze({
  brand: THEME.accent,
  primary: THEME.primary,
  neutral: THEME.accent,
  info: THEME.primary,
  success: THEME.accent,
  warning: 0xF0B232,
  danger: 0xED4245,
});
const STATUS = Object.freeze({
  info: { label: "Update", key: "info", fallback: "ℹ️" },
  success: { label: "Done", key: "check", fallback: "✅" },
  warning: { label: "Attention", key: "warn", fallback: "⚠️" },
  danger: { label: "Error", key: "cross", fallback: "❌" },
});
const CUSTOM_EMOJI = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/;
const UNICODE_EMOJI = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0E\uFE0F]+$/u;

function displayEmoji(value, fallback = "ℹ️") {
  for (const candidate of [value, fallback]) {
    if (typeof candidate !== "string") continue;
    const token = candidate.trim();
    if (CUSTOM_EMOJI.test(token) || (token.length <= 32 && UNICODE_EMOJI.test(token) && /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(token))) return token;
  }
  return "ℹ️";
}

function componentEmoji(value, fallback) {
  const token = displayEmoji(value, fallback);
  const custom = CUSTOM_EMOJI.exec(token);
  return custom ? { id: custom[3], name: custom[2], animated: Boolean(custom[1]) } : { name: token };
}

const flags = (ephemeral = false) => MessageFlags.IsComponentsV2 |
  (ephemeral ? MessageFlags.Ephemeral : 0);

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator() {
  return new SeparatorBuilder().setDivider(true);
}

function container(color = COLORS.brand) {
  const component = new ContainerBuilder();
  return Number.isInteger(color) ? component.setAccentColor(color) : component;
}

function notice({ title, description, emoji, tone = "info" }) {
  const status = STATUS[tone] || STATUS.info;
  const icon = displayEmoji(emoji || applicationEmojis[status.key], status.fallback);
  const card = container(COLORS[tone] || COLORS.info)
    .addTextDisplayComponents(text(`-# ${status.label}\n### ${icon} ${title}`));

  if (description) {
    card.addSeparatorComponents(separator());
    card.addTextDisplayComponents(text(description));
  }
  return card;
}

function noticePayload(options, ephemeral = false) {
  return { components: [notice(options)], flags: flags(ephemeral) };
}

module.exports = { COLORS, componentEmoji, container, displayEmoji, flags, notice, noticePayload, separator, text };
