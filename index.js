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

// ---------- STOCK BOARD UPDATER (Robust) ----------
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
  if (boardIntervals[key]) {
    console.log(`Updater already running for ${key}`);
    return;
  }

  try {
    // fetch channel
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.warn(`startBoardUpdater: channel ${channelId} not found. Removing board ${key}.`);
      // remove from boards file
      delete boards[key];
      saveBoards(boards);
      return;
    }

    // try fetch message
    let msg = null;
    try {
      msg = await channel.messages.fetch(messageId);
    } catch (err) {
      // message not found or deleted
      msg = null;
    }

    // if message missing (deleted), recreate it and save new messageId
    if (!msg) {
      console.log(`Board message ${messageId} not found in channel ${channelId}. Creating new board message...`);
      gifts = loadGifts();
      const newEmbed = buildStockEmbed();
      const sent = await channel.send({ embeds: [newEmbed] });
      // update boards mapping and persistent storage
      boards[key] = { guildId, channelId, messageId: sent.id };
      saveBoards(boards);
      msg = sent;
      messageId = sent.id;
      console.log(`Created new board message ${sent.id} for ${key}`);
    }

    // immediately update once
    gifts = loadGifts();
    await msg.edit({ embeds: [buildStockEmbed()] });

    // set interval
    const iv = setInterval(async () => {
      try {
        gifts = loadGifts(); // reload from disk to pick up external changes
        await msg.edit({ embeds: [buildStockEmbed()] });
      } catch (err) {
        console.error(`Gagal update stockboard (${key}):`, err?.message ?? err);
        // attempt recovery
        try {
          const ch = await client.channels.fetch(channelId).catch(() => null);
          if (!ch) {
            console.warn(`Channel ${channelId} not available anymore. Stopping updater for ${key} and removing board.`);
            clearInterval(iv);
            delete boardIntervals[key];
            delete boards[key];
            saveBoards(boards);
            return;
          }
          // try re-fetch message
          const m = await ch.messages.fetch(messageId).catch(() => null);
          if (!m) {
            console.warn(`Message ${messageId} missing. Will recreate now.`);
            gifts = loadGifts();
            const newEmbed2 = buildStockEmbed();
            const sent2 = await ch.send({ embeds: [newEmbed2] });
            boards[key] = { guildId, channelId, messageId: sent2.id };
            saveBoards(boards);
            msg = sent2;
            messageId = sent2.id;
            console.log(`Recreated board message ${sent2.id} for ${key}`);
          } else {
            msg = m;
            messageId = m.id;
          }
        } catch (innerErr) {
          console.error("Recovery attempt failed:", innerErr);
        }
      }
    }, 10_000); // 10 detik

    boardIntervals[key] = iv;
    console.log(`Started stockboard updater for ${key} (msg ${messageId})`);
  } catch (err) {
    console.error("Could not start board updater for", key, err);
    // if fatal, make sure not to keep a stale interval pointer
    if (boardIntervals[key]) {
      clearInterval(boardIntervals[key]);
      delete boardIntervals[key];
    }
  }
}

function startAllBoardUpdaters() {
  gifts = loadGifts();
  boards = loadBoards();
  const keys = Object.keys(boards);
  if (keys.length === 0) {
    console.log("No boards to start.");
    return;
  }
  for (const compositeKey of keys) {
    const entry = boards[compositeKey];
    if (!entry || !entry.channelId || !entry.messageId) {
      console.warn(`Invalid board entry for key ${compositeKey}, skipping.`);
      continue;
    }
    startBoardUpdater(compositeKey, entry.guildId, entry.channelId, entry.messageId);
  }
}

function stopBoardUpdater(key) {
  if (boardIntervals[key]) {
    clearInterval(boardIntervals[key]);
    delete boardIntervals[key];
    console.log(`Stopped board updater for ${key}`);
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
    const embed = new EmbedBuilder()
      .setTitle("🎁 Kamu menerima Gift!")
      .addFields(
        { name: "Item", value: item, inline: true },
        { name: `Kode (${codes.length})`, value: `\`\`\`\n${codeList}\n\`\`\``, inline: false },
        { name: "Dikirim oleh", value: msg.author.tag, inline: false }
      )
      .setFooter({ text: "Jaga kerahasiaan kode ini." })
      .setTimestamp();

    try {
      await target.send({ embeds: [embed] });
      msg.reply(`✅ Gift '${item}' (${codes.length} kode) sudah dikirim ke ${target.tag}`);
    } catch {
      // jika gagal DM, kembalikan codes ke awal stock agar urutannya tetap:
      gifts = loadGifts(); // reload untuk safety
      if (!gifts[item]) gifts[item] = [];
      gifts[item] = codes.concat(gifts[item]);
      saveGifts(gifts);
      msg.reply("❌ DM user tertutup. Kode dikembalikan ke stok.");
    }
  }

  // ----- Tambahan: !addstock (prefix) -----
  // Usage: !addstock itemName code1,code2,code3  OR !addstock itemName (attach file)
  if (args[0] === "!addstock") {
    if (!msg.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      return msg.reply("❌ Kamu bukan admin.");
    }

    const item = args[1]?.toLowerCase();
    const raw = msg.content.split(/\s+/).slice(2).join(" ");
    if (!item) return msg.reply("❗ Contoh: `!addstock diamond code1,code2,code3`");

    // parse codes from message content (comma or newline)
    let codes = [];
    if (raw) {
      codes = raw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
    }

    // if no codes in message, but attachment present and is txt, try to read it
    if (codes.length === 0 && msg.attachments.size > 0) {
      const att = msg.attachments.first();
      if (att && att.url.endsWith(".txt")) {
        try {
          const res = await fetch(att.url);
          const text = await res.text();
          codes = text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
        } catch (e) {
          console.warn("Failed to fetch attachment for addstock:", e?.message ?? e);
        }
      }
    }

    if (codes.length === 0) return msg.reply("❗ Tidak ada kode ditemukan. Ketik kode setelah nama item dipisah koma, atau lampirkan file .txt");

    gifts = loadGifts();
    if (!gifts[item]) gifts[item] = [];
    gifts[item].push(...codes);
    saveGifts(gifts);

    msg.reply(`✅ Berhasil menambahkan ${codes.length} kode ke item **${item}**. Total stok sekarang: **${gifts[item].length}**.`);
  }
});

// Login
client.login(process.env.TOKEN);
