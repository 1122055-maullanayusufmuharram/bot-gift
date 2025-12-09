import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import fs from "fs";
const BOARDS_FILE = "./boards.json";
const GIFTS_FILE = "./gifts.txt";

function loadBoards() {
  try { return JSON.parse(fs.readFileSync(BOARDS_FILE, "utf8")); } catch { return {}; }
}
function saveBoards(b) { fs.writeFileSync(BOARDS_FILE, JSON.stringify(b, null, 2)); }

function buildStockEmbed(gifts) {
  const embed = new EmbedBuilder()
    .setTitle("📦 Live Stock Gift")
    .setTimestamp();

  const lines = Object.keys(gifts).length
    ? Object.keys(gifts).map(k => `🔹 **${k}** — Stok: ${gifts[k].length}`).join("\n")
    : "Tidak ada item.";

  embed.setDescription(lines);
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName("stockboard")
    .setDescription("Buat pesan stock yang akan otomatis di-update setiap 10 detik")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // build embed from current gifts
    let gifts = {};
    try { gifts = JSON.parse(fs.readFileSync(GIFTS_FILE, "utf8")); } catch {}
    const embed = buildStockEmbed(gifts);

    const sent = await interaction.channel.send({ embeds: [embed] });
    // save to boards
    const key = `${interaction.guild.id}_${interaction.channel.id}`;
    const boards = loadBoards();
    boards[key] = {
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      messageId: sent.id
    };
    saveBoards(boards);

    await interaction.reply({ content: "✅ Stockboard dibuat dan akan diupdate setiap 10 detik.", ephemeral: true });
  }
};
