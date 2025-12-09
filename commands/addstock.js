import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import fs from "fs";
const GIFTS_FILE = "./gifts.txt";

export default {
  data: new SlashCommandBuilder()
    .setName("addstock")
    .setDescription("Tambah stock / kode untuk sebuah item (pisahkan kode dengan koma atau newline)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => opt.setName("item").setDescription("Nama item").setRequired(true))
    .addStringOption(opt => opt.setName("codes").setDescription("Kode (pisahkan dengan koma atau newline)").setRequired(true)),

  async execute(interaction) {
    const item = interaction.options.getString("item").toLowerCase();
    const codesRaw = interaction.options.getString("codes");

    // parse codes: split by newline or comma
    const codes = codesRaw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

    let gifts = {};
    try {
      gifts = JSON.parse(fs.readFileSync(GIFTS_FILE, "utf8"));
    } catch {
      gifts = {};
    }

    if (!gifts[item]) gifts[item] = [];
    gifts[item].push(...codes);
    fs.writeFileSync(GIFTS_FILE, JSON.stringify(gifts, null, 2));

    return interaction.reply({
      content: `✅ Berhasil menambahkan ${codes.length} kode ke item **${item}**. Total stok sekarang: **${gifts[item].length}**.`,
      ephemeral: true
    });
  }
};
