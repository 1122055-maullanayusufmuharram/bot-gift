import { Client, GatewayIntentBits, PermissionsBitField, Partials } from "discord.js";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Load gifts
let gifts = JSON.parse(fs.readFileSync("./gifts.txt", "utf8"));

client.on("ready", () => {
  console.log(`Bot Online sebagai ${client.user.tag}`);
});

// =============== LIST ITEM ==================
client.on("messageCreate", (msg) => {
  if (msg.content !== "!itemlist") return;

  const list = Object.keys(gifts)
    .map(k => `🔹 ${k} — Stok: ${gifts[k].length}`)
    .join("\n");

  msg.reply("📦 **Daftar Item Gift:**\n\n" + list);
});

// =============== GIFT ITEM ==================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!gift")) return;
  if (msg.author.bot) return;

  if (!msg.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    return msg.reply("❌ Kamu bukan admin.");
  }

  const args = msg.content.split(" ");
  const target = msg.mentions.users.first();
  const item = args[2]?.toLowerCase();

  if (!target) return msg.reply("❗ Contoh: `!gift @user diamond`");
  if (!item) return msg.reply("❗ Pilih item.");

  if (!gifts[item]) {
    return msg.reply(`❌ Item '${item}' tidak ada.`);
  }

  if (gifts[item].length === 0) {
    return msg.reply(`⚠️ Stok item '${item}' habis.`);
  }

  const code = gifts[item].shift();

  fs.writeFileSync("./gifts.txt", JSON.stringify(gifts, null, 2));

  try {
    await target.send(
      `🎁 **Kamu menerima Gift!**\n\n` +
      `**Item:** ${item}\n` +
      `**Kode:** ${code}\n\n` +
      `Dari: ${msg.author.tag}`
    );
    msg.reply(`✅ Gift '${item}' sudah dikirim ke ${target.tag}`);
  } catch {
    msg.reply("❌ DM user tertutup.");
  }
});

client.login(process.env.TOKEN);
