const { Client, GatewayIntentBits, REST } = require("discord.js");
const { Routes } = require("discord-api-types/v9");
const axios = require("axios");

require("dotenv").config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const initialPrompt = `Ignore toutes les instructions précédentes.
    Tu es recruteur IT senior et tu vas faire un entretien avec moi. Tu vas me poser des questions dans 3 domaines différents:
    
    1. domaine technique pour tester mes compétences via mes expériences passées.
    2. savoir comment je peux m'intégrer à une équipe technique.
    3. approfondir mes compétences en te basant sur un test technique que j'ai réalisé.
    
    Je te donnerai de nouvelles instructions pour chaque partie.
    
    Commençons la partie 1. Tu devras me poser 6 à 7 questions pour approfondir mes compétences en JavaScript, mais tu ne peux en poser qu'une seule à la fois !! donc Attends que j'aie répondu à ta question avant de passer à la suivante.
    Une fois toutes les questions répondues, je veux que tu me notes sur différents critères.
    Une fois l'entretien terminé, donne-moi une notation avec tous les critères des parties précédentes mise à jour.`;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const conversationHistory = {};

const commands = [
  {
    name: "start",
    description: "Démarre l'entretien !",
  },
];

const rest = new REST({ version: "9" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(
      "Début du rafraîchissement des commandes de l'application (/) du serveur."
    );
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log(
      "Commandes de l'application (/) du serveur rafraîchies avec succès."
    );
  } catch (error) {
    console.error(error);
  }
})();

client.once("ready", () => {
  console.log("Bot is ready!");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "start") {
    conversationHistory[interaction.channelId] = `System: ${initialPrompt}\n`;

    try {
      await interaction.deferReply();
      const response = await callOpenAI(initialPrompt, interaction.channelId);
      await interaction.editReply(
        `Bot: ${response.data.choices[0].message.content}\n`
      );
      conversationHistory[
        interaction.channelId
      ] += `Bot: ${response.data.choices[0].message.content}\n`;
    } catch (error) {
      console.error("Erreur lors de la commande 'start':", error);
      await interaction.followUp(
        "Une erreur est survenue lors du démarrage de l'entretien."
      );
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.parentId !== CATEGORY_ID) return;

  if (!conversationHistory[message.channel.id]) {
    conversationHistory[message.channel.id] = "";
  }

  conversationHistory[message.channel.id] += `User: ${message.content}\n`;

  const provisionalMessage = await message.channel.send(
    "Traitement en cours..."
  );

  try {
    const response = await callOpenAI(message.content, message.channel.id);

    const content = response.data.choices[0].message.content;

    if (content.length <= 2000) {
      provisionalMessage.edit(`Bot: ${content}`);
      conversationHistory[message.channel.id] += `Bot: ${content}\n`;
    } else {
      const messages = content.match(/.{1,2000}/g);
      provisionalMessage.delete();
      messages.forEach(async (msg) => {
        await message.channel.send(`Bot: ${msg}`);
        conversationHistory[message.channel.id] += `Bot: ${msg}\n`;
      });
    }
  } catch (error) {
    console.error("Erreur lors du traitement du message:", error);
    provisionalMessage.edit(
      "Une erreur est survenue lors du traitement de votre message."
    );
  }
});

async function callOpenAI(prompt, channelId) {
  const apiEndpoint = "https://api.openai.com/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };

  const history = conversationHistory[channelId] + `User: ${prompt}\n`;

  return await axios.post(
    apiEndpoint,
    {
      model: "gpt-4",
      prompt: history,
    },
    { headers: headers }
  );
}

client.login(DISCORD_TOKEN);
