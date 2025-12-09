import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import fs from "fs";
const GIFTS_FILE = "./gifts.txt";

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
    )
    .addIntegerOption(option =>
      option.setName("qty")
        .setDescription("Jumlah kode yang dikirim (default 1)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("target");
    const item = interaction.options.getString("item").toLowerCase();
    const qty = Math.max(1, interaction.options.getInteger("qty") || 1);

    let gifts;
    try {
      gifts = JSON.parse(fs.readFileSync(GIFTS_FILE, "utf8"));
    } catch {
      gifts = {};
    }

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

    if (gifts[item].length < qty) {
      return interaction.reply({
        content: `⚠️ Stok tidak cukup. Permintaan: ${qty}, Stok: ${gifts[item].length}`,
        ephemeral: true
      });
    }

    // ambil qty kode
    const codes = gifts[item].splice(0, qty);
    fs.writeFileSync(GIFTS_FILE, JSON.stringify(gifts, null, 2));

    // bangun embed dengan list kode (kode banyak → tampilkan dalam code block)
    const codeList = codes.join("\n");
    const embed = new EmbedBuilder()
      .setTitle("🎁 Kamu menerima Gift!")
      .addFields(
        { name: "Item", value: item, inline: true },
        { name: `Kode (${codes.length})`, value: `\`\`\`\n${codeList}\n\`\`\``, inline: false },
        { name: "Dari Admin", value: interaction.user.tag, inline: false }
      )
      .setFooter({ text: "Jaga kerahasiaan kode ini." })
      .setTimestamp();

    try {
      await target.send({ embeds: [embed] });
      await interaction.reply(`✅ Gift **${item}** (${codes.length} kode) berhasil dikirim ke **${target.tag}**.`);
    } catch (err) {
      // kembalikan kode ke awal stock
      let giftsReload;
      try { giftsReload = JSON.parse(fs.readFileSync(GIFTS_FILE, "utf8")); } catch { giftsReload = {}; }
      if (!giftsReload[item]) giftsReload[item] = [];
      giftsReload[item] = codes.concat(giftsReload[item]);
      fs.writeFileSync(GIFTS_FILE, JSON.stringify(giftsReload, null, 2));

      return interaction.reply({
        content: "❌ Gagal mengirim DM (DM mungkin tertutup). Kode dikembalikan ke stok.",
        ephemeral: true
      });
    }
  }
};
