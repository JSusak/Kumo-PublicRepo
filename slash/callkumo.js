const { SlashCommandBuilder } = require("@discordjs/builders");
const { createReadStream } = require("node:fs");
const { join } = require("node:path");
const ms = require("pretty-ms");
const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const database = require("../events/databasehandler");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("callkumo")
    .setDescription("Summon Kumo to your current VC."),

  run: async ({ client, interaction }) => {
    if (!interaction.guild) {
      return interaction.editReply("You cannot call Kumo in a DM.");
    }

    if (!interaction.member.voice.channel) {
      return interaction.editReply("Kumo cannot join if you aren't in a VC.");
    }

    /**
     * Play the intro sound in a designated channel.
     * @param {*} channelId The channel to play the intro in.
     */
    function playIntro(channelId) {
      client.channels
        .fetch(channelId)
        .then((channel) => {
          const connection = getVoiceConnection(channel.guild.id);

          //Fetches the corresponding intro sound from the resources folder.
          let resource = createAudioResource(
            createReadStream(join(__dirname, "../resources/kumo.wav")),
            {
              inlineVolume: true,
            }
          );

          const player = createAudioPlayer();
          try {
            connection.subscribe(player);
            player.play(resource);
          } catch (e) {
            console.log(e);
            return;
          }
          console.log("Playing intro sound...");
          //Provides textual indication that kumo has joined the vc.
          interaction.editReply("Kumo has joined your VC! (＝⌒▽⌒＝)");
          setTimeout(() => player.stop(), 2000);
        })
        .then(console.log("intro sent."))
        .catch(async (e) => {
          console.log(e);
          return;
        });
    }

    /**
     * Play a randomly assigned voice cue.
     * @param {*} channelId The channel to play the voice cue in.
     */
    async function playVoiceCue(channelId) {
      client.channels
        .fetch(channelId)
        .then((channel) => {
          const connection = getVoiceConnection(channel.guild.id);
          let soundEffect;
          let prompt;
          const randEffect = Math.floor(Math.random() * 4);

          //A randomly chosen sound effect is produced depending on the value of randEffect.
          switch (randEffect) {
            case 0:
              soundEffect = createAudioResource(
                createReadStream(join(__dirname, "../resources/yes.wav")),
                {
                  inlineVolume: true,
                }
              );
              prompt = "yes";
              break;

            case 1:
              soundEffect = createAudioResource(
                createReadStream(join(__dirname, "../resources/no.wav")),
                {
                  inlineVolume: true,
                }
              );
              prompt = "no";
              break;

            case 2:
              soundEffect = createAudioResource(
                createReadStream(join(__dirname, "../resources/laugh.wav")),
                {
                  inlineVolume: true,
                }
              );
              prompt = "laughing";
              break;

            case 3:
              soundEffect = createAudioResource(
                createReadStream(join(__dirname, "../resources/ugh.wav")),
                {
                  inlineVolume: true,
                }
              );
              prompt = "disgust";
              break;
          }
          console.log(
            "Number chosen: " +
              randEffect +
              ". This corresponds to " +
              prompt +
              "."
          );

          const player = createAudioPlayer();

          try {
            connection.subscribe(player);
            player.play(soundEffect);
          } catch (e) {
            console.log(e);
            return;
          }

          console.log("Playing random sound...");
          setTimeout(() => player.stop(), 2000);
        })
        .then(console.log("Random sound sent."))
        .catch(async (e) => {
          console.log(e);
          return;
        });
    }

    let kumoChannel = interaction.member.voice.channel.id;
    console.log(kumoChannel);

    client.channels
      .fetch(kumoChannel)
      .then(async (channel) => {
        let connection = getVoiceConnection(channel.guild.id);
        if (connection) {
          await interaction.editReply("Kumo is already in a VC!");
          return;
        }

        //A connection is established to a voice channel, allowing Kumo to listen for which users start and finish talking,
        //giving Kumo ample time to generate a response.
        connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
        });

        playIntro(kumoChannel);

        connection.receiver.speaking.on("start", (userId) => {
          console.log(
            userId +
              " has begun to ask Kumo a question in Kumo channel " +
              kumoChannel
          );
        });

        connection.receiver.speaking.on("end", async (userId) => {
          const t = client.timeouts.get(`${kumoChannel}_Cooldown`) || 0;
          if (Date.now() - t < 0) {
            console.log(
              `Channel ${kumoChannel} has a cooldown of ${ms(t - Date.now(), {
                compact: true,
              })} before Kumo can talk.`
            );
            return;
          } else {
            /**
             * Listens for end of voice input then produces a random response.
             */
            client.timeouts.set(`${kumoChannel}_Cooldown`, Date.now() + 8000);
            console.log(
              userId +
                " has finished asking a question in Kumo channel " +
                kumoChannel
            );
            playVoiceCue(kumoChannel);

            /**
             * Increment voice score by one if database is supplied. If none given in .env, no score is increased.
             */
            await database.incrementDB(userId, 0, 1, Date.now());
          }
        });

        connection.on(
          VoiceConnectionStatus.Disconnected,
          async (oldState, newState) => {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 3000),
              entersState(connection, VoiceConnectionStatus.Connecting, 3000),

              console.log(connection.packets.state.channel_id),
            ]);
            if (!connection.packets.state.channel_id) {
              //Occurs if Kumo is disconnected manually. Destroys the voice connection.
              console.log(
                "Kumo has been kicked by a user using disconnect. Destroying connection."
              );
              connection.destroy();
            } else {
              //Indicates movement to a new channel, this channel is now designated as Kumo's new channel.
              kumoChannel = connection.packets.state.channel_id;
              console.log(
                "Kumo has not been disconnected. Moved to new channel " +
                  kumoChannel
              );
            }
          }
        );
      })
      .then(console.log("Call Kumo sent."))
      .catch(async (e) => {
        console.log(e);
        return;
      });
  },
};
