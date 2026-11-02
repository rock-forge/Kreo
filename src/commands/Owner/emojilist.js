const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  name: "emojilist",
  aliases: ["elist", "emojishow"],
  description: "Display all emojis in src/emojis.js for easy replacement.",
  category: "Owner",
  args: false,
  usage: "",
  userPerms: [],
  owner: true,
  cooldown: 5,

  async execute(message, args, client) {
    const guild = message.guild;
    const emojis = guild.emojis.cache;

    if (emojis.size === 0) {
      const errorDisplay = new TextDisplayBuilder().setContent(
        `**${client.emoji.cross} No custom emojis found in this server!**`
      );

      const container = new ContainerBuilder().addTextDisplayComponents(
        errorDisplay
      );

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const header = new TextDisplayBuilder().setContent(
      `### ${client.emoji.check} **Server Emoji List**\n-# Copy the names and codes to update \`src/emojis.js\``
    );

    const separator = new SeparatorBuilder();

    // Grouping emojis to avoid hitting message length limits
    let emojiText = "";
    const chunks = [];

    const sortedEmojis = Array.from(emojis.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const emoji of sortedEmojis) {
      const emojiString = emoji.animated
        ? `<a:${emoji.name}:${emoji.id}>`
        : `<:${emoji.name}:${emoji.id}>`;
      const line = `${emoji.name}:  \`${emojiString}\`  | ${emojiString}\n`;

      if ((emojiText + line).length > 3500) {
        chunks.push(emojiText);
        emojiText = line;
      } else {
        emojiText += line;
      }
    }
    chunks.push(emojiText);

    // Send the first message with header and separator
    const firstContent = chunks.shift();
    const firstDisplay = new TextDisplayBuilder().setContent(firstContent);

    const firstContainer = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(separator)
      .addTextDisplayComponents(firstDisplay);

    await message.reply({
      components: [firstContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    // Send remaining chunks if any
    for (const chunk of chunks) {
      const display = new TextDisplayBuilder().setContent(chunk);
      const container = new ContainerBuilder().addTextDisplayComponents(display);

      await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },
};
