const { ApplicationCommandOptionType, ContainerBuilder, TextDisplayBuilder, MessageFlags, escapeMarkdown } = require("discord.js");
const Blacklist = require("../../schema/blacklist");
const { isBotOwner } = require("../../utils/commandAccess");

const userOption = { name: "user", description: "Discord user", type: ApplicationCommandOptionType.User, required: true };
const command = {
  name: "blacklist",
  aliases: ["block", "banbot"],
  description: "Manage users blocked from using the bot.",
  category: "Owner",
  owner: true,
  usage: "<add|remove|status|list> [@user or user ID]",
  slashOptions: [
    ...["add", "remove", "status"].map((name) => ({
      name, description: `${name === "add" ? "Block" : name === "remove" ? "Unblock" : "Check"} a user`,
      type: ApplicationCommandOptionType.Subcommand, options: [userOption],
    })),
    { name: "list", description: "List the 25 most recently blocked users", type: ApplicationCommandOptionType.Subcommand },
  ],

  async slashExecute(interaction, client) {
    if (!isBotOwner(client, interaction.user.id)) {
      return interaction.reply({ content: "Only the bot owners can manage the blacklist.", flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const content = await manage(client, interaction.options.getSubcommand(), interaction.options.getUser("user")?.id);
    return interaction.editReply(payload(content));
  },

  async execute(message, args, client) {
    if (!isBotOwner(client, message.author.id)) return message.reply({ content: "Only the bot owners can manage the blacklist." });
    const action = (args[0] || "").toLowerCase();
    const userId = args[1]?.replace(/^<@!?|>$/g, "");
    return message.reply(payload(await manage(client, action, userId)));
  },
};

function payload(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function manage(client, action, userId) {
  try {
    if (action === "list") {
      const entries = await Blacklist.find({}).sort({ timestamp: -1 }).limit(25).lean();
      return entries.length ? `### Blocked users\n${entries.map((entry) => `• \`${escapeMarkdown(entry.userId)}\``).join("\n")}` : "There are no blocked users.";
    }
    if (!["add", "remove", "status"].includes(action) || !/^\d{17,20}$/.test(userId || "")) {
      return "Use `blacklist add`, `blacklist remove`, or `blacklist status` with a user mention or ID, or `blacklist list`.";
    }
    if (action === "add") {
      if (isBotOwner(client, userId)) return "Bot owners cannot be blacklisted.";
      await Blacklist.updateOne({ userId }, { $set: { type: "user", timestamp: new Date() } }, { upsert: true, runValidators: true });
      return `Blocked user \`${userId}\` from using the bot.`;
    }
    if (action === "remove") {
      const result = await Blacklist.deleteOne({ userId });
      return result.deletedCount ? `Unblocked user \`${userId}\`.` : `User \`${userId}\` is not blacklisted.`;
    }
    const blocked = await Blacklist.findOne({ userId }).lean();
    return `User \`${userId}\` is ${blocked ? "blacklisted" : "not blacklisted"}.`;
  } catch (error) {
    client.logger?.log(`Blacklist update failed: ${error.message}`, "error");
    return "I could not update the blacklist. Please try again shortly.";
  }
}

module.exports = command;
