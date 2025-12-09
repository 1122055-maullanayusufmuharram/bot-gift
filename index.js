import { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField } from "discord.js";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const GIFTS_FILE = "./gifts.txt";
const BOARDS_FILE = "./boards.json";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// === helper read/write ===
function loadGifts() {
  try {
    return JSON.parse(fs.readFileSync(GIFTS_FILE, "utf8"));
  } catch (e) {
    console.log("gifts.txt error / kosong.");
    return {};
  }
}
function saveGifts(gifts) {
  fs.writeFileSync(GIFTS_FILE, JSON.stringify(gifts, null, 2));
}

function loadBoards() {
  try {
    return JSON.parse(fs.readFileSync(BOARDS_FILE, "utf8"));
  } catch (e) {
    return {}; // { "<guildId>_<channelId>": { guildId, channelId, messageId } }
  }
}
function saveBoards(boards) {
  fs.writeFileSync(BOARDS_FILE, JSON.stringify(boards, null, 2));
}

// Global in-memory
let gifts = loadGifts();
let boards = loadBoards();
let boardIntervals = {}; // key -> interval

client.on("ready", () => {
  console.log(`Bot Online sebagai ${client.user.tag}`);
  // Start all board updaters
  startAllBoardUpdaters();
});

// ---------- STOCK BOARD UPDATER ----------
function buildStockEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("📦 Live Stock Gift")
    .setTimestamp();

  const lines = Object.keys(gifts).length
    ? Object.keys(gifts).map(k => `🔹 **${k}** — Stok: ${gifts[k].length}`).join("\n")
    : "Tidak ada item.";

  embed.setDescription(lines);
  return embed;
}

async function startBoardUpdater(key, guildId, channelId, messageId) {
  // avoid duplicate
  if (boardIntervals[key]) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error("Channel not found");
    const msg = await channel.messages.fetch(messageId);
    if (!msg) throw new Error("Message not found");
    // immediately update once
    gifts = loadGifts();
    await msg.edit({ embeds: [buildStockEmbed()] });
    // set interval
    const iv = setInterval(async () => {
      try {
        gifts = loadGifts(); // reload from disk to pick up external changes
        await msg.edit({ embeds: [buildStockEmbed()] });
      } catch (err) {
        console.error("Gagal update stockboard:", err);
      }
    }, 10_000); // 10 detik
    boardIntervals[key] = iv;
    console.log(`Started stockboard updater for ${key}`);
  } catch (err) {
    console.error("Could not start board updater for", key, err);
  }
}

function startAllBoardUpdaters() {
  gifts = loadGifts();
  boards = loadBoards();
  for (const compositeKey of Object.keys(boards)) {
    const { guildId, channelId, messageId } = boards[compositeKey];
    startBoardUpdater(compositeKey, guildId, channelId, messageId);
  }
}

function stopBoardUpdater(key) {
  if (boardIntervals[key]) {
    clearInterval(boardIntervals[key]);
    delete boardIntervals[key];
  }
}

// ---------------- MESSAGE HANDLER (prefix) ----------------
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const args = msg.content.trim().split(/\s+/);

  // ----- LIST ITEM -----
  if (msg.content === "!itemlist") {
    gifts = loadGifts();
    const embed = buildStockEmbed();
    return msg.reply({ embeds: [embed] });
  }

  // ----- GIFT ITEM (prefix) -----
  // Usage: !gift @user itemName 3
  if (args[0] === "!gift") {
    if (!msg.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      return msg.reply("❌ Kamu bukan admin.");
    }

    const target = msg.mentions.users.first();
    const item = args[2]?.toLowerCase();
    // optional qty pada arg ke-3 (contoh: !gift @user diamond 3)
    const qty = Math.max(1, parseInt(args[3]) || 1);

    if (!target) return msg.reply("❗ Contoh: `!gift @user diamond 1`");
    if (!item) return msg.reply("❗ Pilih item.");

    gifts = loadGifts();
    if (!gifts[item]) {
      return msg.reply(`❌ Item '${item}' tidak ada.`);
    }

    if (gifts[item].length === 0) {
      return msg.reply(`⚠️ Stok item '${item}' habis.`);
    }

    if (gifts[item].length < qty) {
      return msg.reply(`⚠️ Stok tidak cukup. Permintaan: ${qty}, Stok: ${gifts[item].length}`);
    }

    // ambil qty kode dari depan array
    const codes = gifts[item].splice(0, qty);
    saveGifts(gifts); // simpan perubahan (kode akan terhapus dari gifts.txt)

    // Embed DM: tampilkan banyak kode (jika banyak → tampilkan per baris)
    const codeList = codes.join("\n");
    const
