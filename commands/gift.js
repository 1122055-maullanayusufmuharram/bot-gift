import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("gift")
    .setDescription("Kirim gift ke user melalui DM")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName("target")
        .setDescription("User yang akan menerima gift")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Nama item yang akan dikirim")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("target");
    const item = interaction.options.getString("item").toLowerCase();

    // Load database gift
    let gifts = JSON.parse(fs.readFileSync("./gifts.txt", "utf8"));

    if (!gifts[item]) {
      return interaction.reply({
        content: `❌ Item **${item}** tidak ditemukan.`,
        ephemeral: true
      });
    }

    if (gifts[item].length === 0) {
      return interaction.reply({
        content: `⚠️ Stok item **${item}** habis.`,
        ephemeral: true
      });
    }

    const code = gifts[item].shift();
    fs.writeFileSync("./gifts.txt", JSON.stringify(gifts, null, 2));

    try {
      await target.send(
        `🎁 **Kamu menerima Gift!**\n\n` +
        `**Item:** ${item}\n` +
        `**Kode:** ${code}\n\n` +
        `Dari Admin: ${interaction.user.tag}`
      );
      interaction.reply(`✅ Gift **${item}** berhasil dikirim ke **${target.tag}**.`);
    } catch (err) {
      interaction.reply({
        content: "❌ Gagal mengirim DM (DM mungkin tertutup).",
        ephemeral: true
      });
    }
  }
};
