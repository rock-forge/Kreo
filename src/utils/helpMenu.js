const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown,
} = require("discord.js");
const { isBotOwner } = require("./commandAccess");

const PAGE_SIZE = 8;
const MENU_LIFETIME = 10 * 60_000;
const META = {
  Music: ["Music", "music", "Playback, queue and listening controls"],
  Favourite: ["Favorites", "favourite", "Save songs and play your favorites"],
  Playlist: ["Playlists", "loop", "Create, organize and play your collections"],
  Config: ["Server settings", "config", "Prefix, ignored channels and 24/7 mode"],
  Information: ["Information", "info", "Help, latency, statistics and links"],
  Utility: ["Utilities", "utility", "Server tools, profiles and recovery"],
  Filters: ["Audio filters", "filters", "Shape your sound"],
  Owner: ["Owner", "star", "Bot management"],
};
const inline = value => String(value || "").replace(/[`\r\n]/g, "").slice(0, 300);
const text = content => new TextDisplayBuilder().setContent(content);
const icon = (client, key) => client.emoji?.[key] || "•";

function visibleCommands(client, userId) {
  return [...client.commands.values()].filter(command =>
    !(command.owner || command.category === "Owner") || isBotOwner(client, userId));
}

function categoriesFor(client, userId) {
  const grouped = new Map();
  for (const command of visibleCommands(client, userId)) {
    const category = command.owner ? "Owner" : command.category || "Other";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(command);
  }
  const order = Object.keys(META);
  return [...grouped].sort(([a], [b]) => {
    const rank = value => order.includes(value) ? order.indexOf(value) : order.length;
    return rank(a) - rank(b) || a.localeCompare(b);
  }).map(([key, commands]) => ({
    key,
    label: META[key]?.[0] || key,
    icon: META[key]?.[1] || "utility",
    description: META[key]?.[2] || "More commands",
    commands: commands.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function menuId(action, userId, expiresAt, category = "home", page = 0) {
  return `help_${action}_${userId}_${expiresAt}_${category}_${page}`;
}

function buildHelpMenu(client, userId, prefix, {
  category = "home", page = 0, expiresAt = Date.now() + MENU_LIFETIME, command,
} = {}) {
  const categories = categoriesFor(client, userId);
  const selected = categories.find(item => item.key === category);
  if (category !== "home" && !selected) throw new Error("This help category is unavailable.");
  const isOwner = isBotOwner(client, userId);
  const commandCount = visibleCommands(client, userId).length;
  const header = new SectionBuilder().addTextDisplayComponents(text(
    `### ${icon(client, "music")} ${escapeMarkdown(client.user.username)}\n` +
    `Your guide to music, playlists and server tools.\n` +
    `-# ${icon(client, isOwner ? "star" : "info")} ${isOwner ? "Bot owner · Owner access enabled" : "Command guide"} · Prefix \`${inline(prefix)}\` · ${commandCount} commands`,
  )).setThumbnailAccessory(new ThumbnailBuilder()
    .setURL(client.user.displayAvatarURL({ extension: "png", size: 128 }))
    .setDescription(`${client.user.username} avatar`));
  const container = new ContainerBuilder().setAccentColor(0xB49AEF)
    .addSectionComponents(header).addSeparatorComponents(new SeparatorBuilder());

  let pageCount = 1;
  if (command) {
    const aliases = (command.aliases || []).map(alias => `\`${inline(alias)}\``).join(" ") || "None";
    const slashAvailable = client.slashCommands?.has(command.name);
    const prefixUsage = typeof command.execute === "function"
      ? `\`${inline(prefix)}${command.name}${command.usage ? ` ${inline(command.usage)}` : ""}\`` : "Use the slash command below.";
    const subcommands = (command.slashOptions || []).filter(option => option.type === 1).map(option => `\`/${command.name} ${option.name}\``);
    container.addTextDisplayComponents(text(
      `### ${icon(client, command.owner ? "star" : "info")} ${inline(command.name)}\n` +
      `${escapeMarkdown(command.description || "No description provided.")}\n\n` +
      `**Usage**\n${prefixUsage}${slashAvailable ? `\n\`/${command.name}\`` : ""}\n\n` +
      `${subcommands.length ? `**Subcommands**\n${subcommands.join(" · ")}\n\n` : ""}` +
      `**Aliases**  ${aliases}\n**Category**  ${command.owner ? "Owner" : command.category || "Other"}` +
      `${command.owner ? `\n${icon(client, "star")} **Bot owner only**` : ""}`,
    ));
  } else if (!selected) {
    container.addTextDisplayComponents(text(
      `### ${icon(client, "play")} Start listening\n` +
      `Join a voice channel, then use \`/play\` or \`${inline(prefix)}play <song or link>\`.\n\n` +
      `**Explore your commands**\n` + categories.map(item =>
        `${icon(client, item.icon)} **${item.label}** · ${item.commands.length}`).join("\n"),
    ));
  } else {
    pageCount = Math.max(1, Math.ceil(selected.commands.length / PAGE_SIZE));
    page = Math.max(0, Math.min(pageCount - 1, Number.isInteger(page) ? page : 0));
    const commands = selected.commands.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    container.addTextDisplayComponents(text(
      `### ${icon(client, selected.icon)} ${selected.label}\n-# ${selected.description} · ${selected.commands.length} commands\n\n` +
      commands.map(item => `**\`${inline(prefix)}${item.name}\`**\n${escapeMarkdown((item.description || "No description provided.").slice(0, 110))}`).join("\n\n"),
    ));
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  const select = new StringSelectMenuBuilder()
    .setCustomId(menuId("select", userId, expiresAt))
    .setPlaceholder("Choose a command category")
    .addOptions(new StringSelectMenuOptionBuilder().setLabel("Home").setValue("home")
      .setDescription("Quick start and command categories").setEmoji(icon(client, "home"))
      .setDefault(!selected && !command));
  for (const item of categories) {
    select.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${item.label} · ${item.commands.length}`)
      .setValue(item.key).setDescription(item.description).setEmoji(icon(client, item.icon))
      .setDefault(selected?.key === item.key && !command));
  }
  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));

  if (selected && !command) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(menuId("page", userId, expiresAt, category, page - 1))
        .setStyle(ButtonStyle.Secondary).setLabel("Previous").setEmoji(icon(client, "previous")).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(menuId("indicator", userId, expiresAt, category, page))
        .setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${pageCount}`).setDisabled(true),
      new ButtonBuilder().setCustomId(menuId("page", userId, expiresAt, category, page + 1))
        .setStyle(ButtonStyle.Secondary).setLabel("Next").setEmoji(icon(client, "skip")).setDisabled(page === pageCount - 1),
    ));
  }
  const links = [
    ["Open dashboard", client.config.dashboard?.nextAuthUrl, "home"],
    ["Invite Kreo", client.config.links?.invite, "music"],
    ["Support", client.config.links?.support, "info"],
  ].filter(([, url]) => { try { const parsed = new URL(url); return parsed.protocol === "https:"; } catch { return false; } });
  if (links.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(links.map(([label, url, emoji]) =>
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url).setEmoji(icon(client, emoji)))));
  container.addTextDisplayComponents(text(
    `-# Use \`${inline(prefix)}help <command>\` for usage and aliases. · Menu expires <t:${Math.floor(expiresAt / 1000)}:R>.\n` +
    `-# [Kreo by rock-forge](https://github.com/rock-forge/Kreo)`,
  ));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } };
}

async function execute(message, args, client, prefix = client.prefix) {
  const query = args[0]?.toLowerCase().replace(/^\//, "");
  let command;
  if (query) {
    const name = client.aliases.get(query) || query;
    command = visibleCommands(client, message.author.id).find(item => item.name === name);
    if (!command) return message.reply({
      components: [new ContainerBuilder().setAccentColor(0xB49AEF).addTextDisplayComponents(text(
        `### ${icon(client, "info")} Command not found\nNo available command matches \`${inline(query)}\`. Use \`${inline(prefix)}help\` to browse your commands.`,
      ))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false },
    });
  }
  return message.reply(buildHelpMenu(client, message.author.id, prefix, { command }));
}

async function componentsV2(interaction, client) {
  const match = /^help_(select|page)_([0-9]{17,20})_([0-9]{13})_([A-Za-z]+)_(-?[0-9]{1,3})$/.exec(interaction.customId);
  const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  if (!match) return reply("Open a new menu with /help.");
  const [, action, ownerId, deadline, savedCategory, savedPage] = match;
  if (interaction.user.id !== ownerId) return reply("This menu belongs to someone else. Use /help to open your own.");
  const expiresAt = Number(deadline);
  if (expiresAt <= Date.now() || expiresAt > Date.now() + MENU_LIFETIME) return reply("This help menu has expired. Use /help to open a new one.");
  const category = action === "select" ? interaction.values?.[0] : savedCategory;
  if (category !== "home" && !categoriesFor(client, ownerId).some(item => item.key === category)) return reply("That category is not available to your account.");
  await interaction.deferUpdate();
  const saved = await require("../schema/prefix").findOne({ Guild: interaction.guildId }).lean();
  return interaction.editReply(buildHelpMenu(client, ownerId, saved?.Prefix || client.prefix, {
    category, page: action === "select" ? 0 : Number(savedPage), expiresAt,
  }));
}

async function autocomplete(interaction, client) {
  const query = interaction.options.getFocused().toLowerCase();
  return interaction.respond(visibleCommands(client, interaction.user.id)
    .filter(command => command.name.includes(query) || command.aliases?.some(alias => alias.includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25)
    .map(command => ({ name: `${command.name} — ${command.description || "Command details"}`.slice(0, 100), value: command.name })));
}

module.exports = { execute, componentsV2, autocomplete, buildHelpMenu, visibleCommands, categoriesFor, MENU_LIFETIME };
