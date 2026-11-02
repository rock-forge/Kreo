const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const commandsPath = path.join(__dirname, "../commands");
  let totalCommands = 0;
  let duplicateCommands = 0;

  fs.readdirSync(commandsPath).forEach((dir) => {
    const commandFiles = fs
      .readdirSync(path.join(commandsPath, dir))
      .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, dir, file);
      const command = require(filePath);

      if (!command || typeof command !== "object" || !command.name) {
        client.logger.log(`Skipping invalid command module: ${filePath}`, "warn");
        continue;
      }

      command.aliases = Array.isArray(command.aliases)
        ? command.aliases.map((alias) => alias.toLowerCase())
        : [];

      const normalizedName = command.name.toLowerCase();

      if (client.commands.has(normalizedName)) {
        duplicateCommands++;
        client.logger.log(
          `Duplicate command name "${normalizedName}" in ${filePath}. Skipping duplicate.`,
          "warn",
        );
        continue;
      }

      command.name = normalizedName;
      client.commands.set(normalizedName, command);

      for (const alias of command.aliases) {
        if (!alias || alias === normalizedName) continue;

        if (client.aliases.has(alias)) {
          client.logger.log(
            `Duplicate alias "${alias}" in ${filePath}. Keeping original mapping.`,
            "warn",
          );
          continue;
        }

        client.aliases.set(alias, normalizedName);
      }

      if (command.slashExecute || command.slashOptions) {
        const slashData = {
          name: normalizedName,
          description: command.description || "No description provided",
          options: command.slashOptions || [],
          category: command.category,
          execute: command.execute,
          slashExecute: command.slashExecute,
          autocomplete: command.autocomplete,
          run: command.run,
          player: command.player,
          inVoiceChannel: command.inVoiceChannel,
          sameVoiceChannel: command.sameVoiceChannel,
          botPerms: command.botPerms,
          userPerms: command.userPerms,
          owner: command.owner || false,
          cooldown: command.cooldown,
        };

        client.slashCommands.set(command.name, slashData);
      }

      totalCommands++;
    }
  });

  for (const alias of client.aliases.keys()) {
    if (client.commands.has(alias)) client.aliases.delete(alias);
  }
  client.logger.log(`Prefix Commands Loaded: ${totalCommands}`, "cmd");
  client.logger.log(`Slash Commands Loaded: ${client.slashCommands.size}`, "cmd");
  client.logger.log(`Aliases Loaded: ${client.aliases.size}`, "cmd");
  if (duplicateCommands > 0) {
    client.logger.log(`Skipped ${duplicateCommands} duplicate command module(s).`, "warn");
  }
};
