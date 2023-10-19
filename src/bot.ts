const { Client, GatewayIntentBits, REST } = require("discord.js");
const { Routes } = require("discord-api-types/v9");
const axios = require("axios");

require("dotenv").config();


const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CLIENT_ID: string | undefined = process.env.CLIENT_ID;
const GUILD_ID: string | undefined = process.env.GUILD_ID;
const CATEGORY_ID: string | undefined = process.env.CATEGORY_ID;

let initialPrompt = ``;

// Création d'une nouvelle instance du client Discord avec des intentions spécifiées.
// Ces intentions définissent pour quels types d'événements le bot devrait écouter.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Écoute les événements liés aux guildes (serveurs).
    GatewayIntentBits.GuildMessages, // Écoute les événements liés aux messages des guildes/serveurs.
    GatewayIntentBits.MessageContent, // Écoute les événements liés au contenu des messages.
  ],
});

// Interface pour définir la structure d'un message.
interface Message {
  role: string; // Le rôle de l'envoyeur du message (par exemple, "utilisateur" ou "assistant").
  content: string;
}
interface Command {
        name: string
        type: number
        description: string
        required: boolean
}
// Objet pour conserver un historique des conversations. 
let conversationHistory: Record<string, Message[]> = {};
let conversationMessageProcessing: Record<string, boolean> = {};

// Tableau des commandes disponibles pour le bot.
const commands : Array<{ name: string; description: string; options?: Array<Command>  }> = [

  {
    name: "setprompt",
    description: "Définir le prompt de l'entretien.",
    options: [
      {
        name: "prompt",
        type: 3,
        description: "Definissez un prompt de départ ici",
        required: true
      }
    ]
  },
  {
    name: "settest",
    description: "Définir le prompt de l'entretien.",
    options: [
      {
        name: "test",
        type: 3,
        description: "envoyez ici le test",
        required: true
      }
    ]
  },
  //TODO : pas encore implémenté
  { 
    name: "help",
    description: "Affiche l'aide." 
  },
];

// Création d'une nouvelle instance REST pour interagir avec l'API Discord.
const rest = new REST({ version: "9" }).setToken(DISCORD_TOKEN);

// Fonction auto-invoquée pour rafraîchir les commandes du bot sur Discord.
(async () => {
  try {
    console.log("Début du rafraîchissement des commandes...");
    
    // Mettre à jour les commandes du bot pour la guilde spécifiée. (GUILD = serveur)
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


// Écouteur pour l'événement "interactionCreate", qui est déclenché lorsque les utilisateurs interagissent avec les commandes du bot.
client.on("interactionCreate", async (interaction: {
  options: any; isCommand?: any; deferReply?: any; channelId?: any; editReply?: any; followUp?: any; reply?: any; channel?: any; send?: any; commandName?: any; 
}) => {
  // Vérifie si l'interaction est une commande.
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "setprompt") {
  initialPrompt = interaction.options.getString("prompt") || "";
  await interaction.reply(`Le prompt a été défini sur : \n >>> ${initialPrompt}\n\n`);
  }
  conversationHistory[interaction.channelId] = [];

  conversationHistory[interaction.channelId].push({
    role: "system",
    content: initialPrompt,
  });
  if(commandName === "settest") {
    try{
    await interaction.reply(`Le test a été défini sur : \n >>> ${interaction.options.getString("test")}\n\n`);

    const res = await callOpenAI([...conversationHistory[interaction.channel.id], { role: "system", content: interaction.options.getString("test") }]);

    const botReply = res.data.choices[0].message.content;

    await interaction.channel.send(`>>> ${botReply}`);

    conversationHistory[interaction.channel.id].push({
      role: "system",
      content: interaction.options.getString("test"),
    });

    conversationHistory[interaction.channel.id].push({
      role: "assistant",
      content: botReply,
    });

    }catch(error){
    console.error("Erreur lors de la commande 'settest':", error);
    await interaction.followUp("Une erreur est survenue lors de la définition du test.");
    }
  }  
});


//Fonction qui traite chaque nouveau message qui n'est pas une slash commande : /next etc.
client.on("messageCreate", async (message: { author: { bot: any; }; channel: { parentId: string | undefined; send: (arg0: string) => any; id: string | number; }; content: any; }) => {

  if (message.author.bot) return;

  if (message.channel.parentId !== CATEGORY_ID) return;

  //ignore si il y'a deux message du user à la suite
  if (conversationMessageProcessing[message.channel.id]) return;

  try{
    conversationMessageProcessing[message.channel.id] = true;
    message.channel.send(`Traitement de votre message en cours...`)

    const res = await callOpenAI([...conversationHistory[message.channel.id], { role: "user", content: message.content }]);
    
    const botReply = res.data.choices[0].message.content;
    await message.channel.send(`>>> ${botReply}`);

    conversationHistory[message.channel.id].push({
      role: "user",
      content: message.content,
    });

    conversationMessageProcessing[message.channel.id] = false;

  }catch(error){
    console.error("Erreur lors de la commande 'messageCreate':", error);
    await message.channel.send("Une erreur est survenue lors de la réponse à votre message.");
  }
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

// OUTDATED but keep for reference : 
  // if (commandName === "start") {
  //   try {
  //     // Je dis à discord que je vais répondre je dispose de 15min maintenant. Autrement discord attend une réponse en 3secondes
  //     await interaction.deferReply();

  //     // Réinitialisez l'historique de la conversation pour ce canal.
  //     conversationHistory[interaction.channelId] = [];

  //     // Créez un nouvel historique de conversation avec le message initial.
  //     // Cette étape est effectuée pour éviter de modifier l'historique existant en cas d'échec de l'API.
  //     const newConversationHistory = [...conversationHistory[interaction.channelId], {
  //       role: "system",
  //       content: initialPrompt,
  //     }];

  //     const response = await callOpenAI(newConversationHistory);
  //     const botReply = response.data.choices[0].message.content;

  //     // Mettez à jour l'historique de la conversation car l'appel API a réussi.
  //     conversationHistory[interaction.channelId] = newConversationHistory;

  //     // Éditez la réponse initiale du bot avec la réponse obtenue de OpenAI.
  //     await interaction.editReply(`${botReply}\n`);

  //     conversationHistory[interaction.channelId].push({
  //       role: "assistant",
  //       content: botReply,
  //     });

  //     // Indique que la conversation a commencé pour ce canal.
  //     conversationStarted[interaction.channelId] = true;

  //   } catch (error) {
  //     console.error("Erreur lors de la commande 'start':", error);
  //     await interaction.followUp("Une erreur est survenue lors du démarrage de l'entretien.");
  //   }
  // }




// si /next
// if (commandName === "next") {
//   try {
//     // Vérifiez si la conversation a commencé dans ce canal.
//     if (!conversationStarted[interaction.channelId])
//       return interaction.reply("L'entretien n'a pas encore commencé !");
    
//       await interaction.deferReply();
    
//     const botReply = await callOpenAI(conversationHistory[interaction.channel.id]);

//     const res = botReply.data.choices[0].message.content;

//     // Vérifiez si la réponse est courte (moins de 2000 caractères).
//     if (res.length <= 2000) {
//       interaction.editReply(res); // Mettez à jour le message temporaire avec la réponse.
//       conversationHistory[interaction.channel.id].push({
//         role: "assistant",
//         content: res,
//       });
//     } else {
//       // Si la réponse est longue, divisez-la en plusieurs messages de moins de 2000 caractères chacun.
//       const messages = res.match(/.{1,2000}/g);

//       // Envoyez chaque message découpé. (Discord bloque le nombre de caractère max)
//       messages.forEach(async (msg: any) => {
//         await interaction.reply(msg);
//       });

//       // Mettez à jour l'historique avec la réponse complète du bot.
//       conversationHistory[interaction.channel.id].push({
//         role: "assistant",
//         content: res,
//       });
//     }
//   } catch (error) {
//     console.error("Erreur lors de la commande 'next':", error);
//     await interaction.followUp("Une erreur est survenue lors de la poursuite de l'entretien.");
//   }
// }