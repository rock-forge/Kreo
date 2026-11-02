const { ApplicationCommandType, Routes } = require("discord.js");

const PRESERVED_FIELDS = [
  "id", "type", "name", "name_localizations", "description", "description_localizations",
  "default_member_permissions", "dm_permission", "nsfw", "integration_types", "contexts", "handler",
];

function mergeApplicationCommands(commands, existing) {
  if (!Array.isArray(existing)) throw new TypeError("Could not read the existing application commands");
  const preserved = existing.filter((command) => command.type !== ApplicationCommandType.ChatInput)
    .map((command) => Object.fromEntries(PRESERVED_FIELDS.filter((key) => command[key] !== undefined)
      .map((key) => [key, command[key]])));
  return [...commands, ...preserved];
}

async function registerApplicationCommands(rest, applicationId, commands) {
  const route = Routes.applicationCommands(applicationId);
  const existing = await rest.get(route);
  return rest.put(route, { body: mergeApplicationCommands(commands, existing) });
}

module.exports = { mergeApplicationCommands, registerApplicationCommands };
