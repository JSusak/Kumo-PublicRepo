const Discord = require("discord.js");
const env = require("dotenv");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const { createReadStream } = require("node:fs");
const fs = require("fs");
const { Player } = require("discord-player");
const mongoose = require("mongoose");
const ms = require("pretty-ms");

const modal = require("./events/modal");

env.config();
const TOKEN = process.env.BOTTOKEN;
const TEST_GUILD_ID = process.env["TEST_GUILD_ID"];
const dbToken = process.env.DBTOKEN;
const feedbackChannel = process.env.FEEDBACKCHANNEL;

/**
 * Attempt to connect to the mongoDB defined in the .env file. If no token supplied the bot will not connect to a database.
 */
dbToken
  ? mongoose
      .connect(dbToken, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .then(() => console.log("📗: Connected to MongoDB!"))
  : console.warn(
      "📙: No token for a database was supplied. Contiuning without connecting to MongoDB."
    );

/**
 * Initialise main Discord Client.
 */
const client = new Discord.Client({
  intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGE_REACTIONS"],
});

client.slashcommands = new Discord.Collection();
client.timeouts = new Discord.Collection();

const commands = [];

const commandFiles = fs
  .readdirSync("./slash")
  .filter((file) => file.endsWith(".js"));

/**
 * Goes through the slash folder, registering each .js file as a slash command.
 */
for (const file of commandFiles) {
  const command = require(`./slash/${file}`);
  commands.push(command.data.toJSON());
  client.slashcommands.set(command.data.name, command);
}

client.player = new Player(client, {
  ytdlOptions: {
    quality: "highestaudio",
    highWaterMark: 1 << 25,
  },
});

client.on("ready", async () => {
  /**
   * Fetching all guilds the bot is in, counting the total number of users.
   */
  const CLIENT_ID = process.env.CLIENTID;

  const Guilds = client.guilds.cache.map((guild) => guild.id);
  console.log(Guilds);

  const totalMembers = client.guilds.cache
    .map((guild) => guild.memberCount)
    .reduce((a, b) => a + b, 0);
  console.log(totalMembers);

  const rest = new REST({
    version: "9",
  }).setToken(TOKEN);

  (async () => {
    try {
      if (!TEST_GUILD_ID) {
        await rest.put(Routes.applicationCommands(CLIENT_ID), {
          body: commands,
        });
        console.log("📗: Registered all commands to all servers.");
      } else {
        await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, TEST_GUILD_ID),
          {
            body: commands,
          }
        );
        console.warn("📙: Registered all commands to just the test server.");
      }
    } catch (error) {
      if (error) console.error(error);
    }
  })();

  /**
   * Sets the activity of the bot to include the total number of users in all guilds, calculated on bot login.
   */
  let newAct = 0;
  const activityArray = [
    { type: "LISTENING", message: `questions! | /help` },
    { type: "PLAYING", message: `with ${totalMembers} users! | /help` },
  ];
  setInterval(() => {
    newAct = (newAct + 1) % activityArray.length;
    client.user.setPresence({
      activities: [
        {
          name: activityArray[newAct].message,
          type: activityArray[newAct].type,
        },
      ],
      status: "idle",
    });
  }, 60000);

  console.log(`${client.user.tag}: Kumo has now logged in.`);
  await new Promise((res) => setTimeout(() => res(2), 500));
});

client.on("interactionCreate", async (interaction) => {
  const t =
    client.timeouts.get(`${interaction.user.id}_${interaction.commandName}`) ||
    0;
  console.log(interaction.user.id);

  //Check for modal submission
  modal.CheckAndGenerateFeedbackModal(client, interaction, feedbackChannel);

  async function handleCommand() {
    if (!interaction.isCommand()) return;

    const scmd = client.slashcommands.get(interaction.commandName);
    if (!scmd) interaction.reply("Not valid slash command.");

    if (Date.now() - t < 0) {
      return interaction.reply(
        `Kumo thinks you are typing too fast! Please wait \`${ms(
          t - Date.now(),
          { compact: true }
        )}\` before asking again.`
      );
    } else {
      client.timeouts.set(
        `${interaction.user.id}_${interaction.commandName}`,
        Date.now() + (scmd.timeout || 0)
      );
      if (interaction.commandName !== "feedback") {
        await interaction.deferReply();
      }
      await scmd.run({ client, interaction });
    }
  }
  handleCommand();
});

/**
 * Log the bot in!
 */
client.login(TOKEN);
