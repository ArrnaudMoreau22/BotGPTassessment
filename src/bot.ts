const { Client, GatewayIntentBits, REST } = require("discord.js");
const { Routes } = require("discord-api-types/v9");
const axios = require("axios");

require("dotenv").config();


const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CLIENT_ID: string | undefined = process.env.CLIENT_ID;
const GUILD_ID: string | undefined = process.env.GUILD_ID;
const CATEGORY_ID: string | undefined = process.env.CATEGORY_ID;

const initialPrompt = `Ignore toutes les instructions précédentes. Tu es recruteur IT senior et tu vas faire un entretien avec moi. Tu vas me poser des questions dans 3 domaines différents: 1) domaine technique pour tester mes compétences via mes expériences passées. 2) savoir comment je peux m'intégrer à une équipe technique. 3) approfondir mes compétences en te basant sur un test technique que j'ai réalisé. Je te donnerai de nouvelles instructions pour chaque partie. Commençons la partie 1. Tu devras me poser 6 à 7 questions pour approfondir mes compétences en JavaScript, mais tu ne peux en poser qu'une seule à la fois !! donc Attends que j'aie répondu à ta question avant de passer à la suivante. Une fois toutes les questions répondues, je veux que tu me notes sur différents critères. Une fois l'entretien terminé, donne-moi une notation avec tous les critères des parties précédentes mise à jour.`;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

interface Message {
  role: string;
  content: string;
}

let conversationHistory: Record<string, Message[]> = {};
let conversationStarted: Record<string, boolean> = {};

const commands : Array<{ name: string; description: string }> = [
  {
    name: "start",
    description: "Démarre l'entretien !",
  },
  {
    name: "next",
    description: "Passe à la question suivante.",
  },
  { 
    name: "help",
    description: "Affiche l'aide." 
  },
];

const rest = new REST({ version: "9" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log("Début du rafraîchissement des commandes...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("Commandes rafraîchies avec succès.");
  } catch (error) {
    console.error(error);
  }
})();

client.once("ready", () => {
  console.log("Bot is ready!");
});

client.on("interactionCreate", async (interaction: { isCommand?: any; deferReply?: any; channelId?: any; editReply?: any; followUp?: any; reply?: any; channel?: any; send?: any; commandName?: any; }) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;
  if (commandName === "start") {
    try {
      await interaction.deferReply();
      conversationHistory[interaction.channelId] = [];

      //Je stock l'historique dans un nouveau tableau pour ne pas le modifier si le call API crash et que je dois le réutiliser
      const newConversationHistory = [...conversationHistory[interaction.channelId], {
        role: "system",
        content: initialPrompt,
    }];    

      const response = await callOpenAI(
        newConversationHistory
      );
      const botReply = response.data.choices[0].message.content;

      //Je met à jour l'historique de conversation puisque le call API a fonctionné
      conversationHistory[interaction.channelId] = newConversationHistory;

      await interaction.editReply(`${botReply}\n`);

      conversationHistory[interaction.channelId].push({
        role: "assistant",
        content: botReply,
      });
      conversationStarted[interaction.channelId] = true;
    } catch (error) {
      console.error("Erreur lors de la commande 'start':", error);
      await interaction.followUp(
        "Une erreur est survenue lors du démarrage de l'entretien."
      );
    }
  }
  if (commandName === "next") {
    let provisionalMessage
    try {
      if (!conversationStarted[interaction.channelId])
        return interaction.reply("L'entretien n'a pas encore commencé !");

      provisionalMessage = await interaction.channel.send("Traitement en cours...");
      const botReply = await callOpenAI(
        conversationHistory[interaction.channel.id]
      );
      const res = botReply.data.choices[0].message.content;
      if (res.length <= 2000) {
        provisionalMessage.edit(res);
        conversationHistory[interaction.channel.id].push({
          role: "assistant",
          content: res,
        });
      } else {
        const messages = res.match(/.{1,2000}/g);
        provisionalMessage.delete();
        messages.forEach(async (msg: any) => {
          await interaction.reply(msg);
        });
        conversationHistory[interaction.channel.id].push({
          role: "assistant",
          content: res,
        });
      }
    } catch (error) {
      console.error("Erreur lors de la commande 'next':", error);
      if (provisionalMessage) provisionalMessage.delete(); // Suppression du message ici
      await interaction.followUp(
        "Une erreur est survenue lors de la poursuite de l'entretien."
      );
    }
  }
});


client.on("messageCreate", async (message: { author: { bot: any; }; channel: { parentId: string | undefined; send: (arg0: string) => any; id: string | number; }; content: any; }) => {
  if (message.author.bot) return;
  if (message.channel.parentId !== CATEGORY_ID) return;

  if (!conversationStarted[message.channel.id])
    return message.channel.send("L'entretien n'a pas encore commencé !");

  const provisionalMessage = await message.channel.send(
    "Traitement en cours..."
  );

  conversationHistory[message.channel.id].push({
    role: "user",
    content: message.content,
  });

  provisionalMessage.edit("**Réponse enregistrée !** _Vous pouvez décomposer votre réponse en plusieurs messages si vous le souhaitez. Pour valider et envoyer votre/vos messages et passer à la question suivante, tapez la commande /next_");
});

async function callOpenAI(content: Message[]) {
  const apiEndpoint = "https://api.openai.com/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };

  const messagesArray = content || [];
  return await axios.post(
    apiEndpoint,
    {
      model: "gpt-4",
      messages: messagesArray,
    },
    { headers: headers }
  );
}

client.login(DISCORD_TOKEN);
