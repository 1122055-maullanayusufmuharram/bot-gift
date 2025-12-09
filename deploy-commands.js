import { REST, Routes } from "discord.js";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const commands = [];

const commandFiles = fs.readdirSync("./commands").filter(f => f.endsWith(".js"));
for (const file of commandFiles) {
  const cmd = await import(`./commands/${file}`);
  // export default harus memiliki .data (SlashCommandBuilder)
  if (cmd.default && cmd.default.data) {
    commands.push(cmd.default.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

try {
  console.log("Uploading slash commands…");
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
  console.log("Done!");
} catch (error) {
  console.error(error);
}
