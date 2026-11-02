const help = require("../../utils/helpMenu");

module.exports = {
  name: "help",
  category: "Information",
  description: "Browse command categories and get help with a command.",
  aliases: ["commands", "cmds", "h"],
  cooldown: 3,
  args: false,
  usage: "[command]",
  slashOptions: [{
    name: "command", description: "Command name or alias", type: 3,
    required: false, autocomplete: true,
  }],
  async slashExecute(interaction, client, prefix = client.prefix) {
    return help.execute({ author: interaction.user, reply: options => interaction.reply(options) },
      [interaction.options.getString("command")].filter(Boolean), client, prefix);
  },
  execute: help.execute,
  componentsV2: help.componentsV2,
  autocomplete: help.autocomplete,
};