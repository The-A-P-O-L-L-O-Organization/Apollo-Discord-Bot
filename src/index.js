// Main Entry Point - Discord Bot
// This file initializes the bot and sets up all event listeners

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from './config/config.js';
import readyHandler from './events/ready.js';
import guildMemberAddHandler from './events/guildMemberAdd.js';

// Create a new Client instance with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    // Enable partials for better member handling
    partials: [
        'CHANNEL',
        'GUILD_MEMBER',
        'MESSAGE',
        'USER'
    ]
});

// Store commands and other data in client for easy access
client.commands = new Collection();
client.config = config;

// Event: Bot is ready and logged in
client.once('ready', () => readyHandler(client));

// Event: New member joins the server
client.on('guildMemberAdd', (member) => guildMemberAddHandler(member));

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    process.exit(1);
});

// Login to Discord with the bot token
client.login(config.DISCORD_TOKEN)
    .then(() => {
        console.log('🔐 Attempting to log in...');
    })
    .catch((error) => {
        console.error('❌ Failed to log in:', error);
        process.exit(1);
    });

export default client;

