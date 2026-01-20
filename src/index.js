// Main Entry Point - Discord Bot
// This file initializes the bot and sets up all event listeners

import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { config } from './config/config.js';
import readyHandler from './events/ready.js';
import guildMemberAddHandler from './events/guildMemberAdd.js';
import commandHandler from './handlers/commandHandler.js';
import eventHandler from './handlers/eventHandler.js';
import { initReminderScheduler } from './utils/reminderScheduler.js';
import { initPollScheduler } from './utils/pollScheduler.js';

// Create a new Client instance with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages
    ],
    // Enable partials for better event handling
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.User,
        Partials.Reaction
    ]
});

// Store commands and other data in client for easy access
client.commands = new Collection();
client.config = config;

// Track bot statistics
client.stats = {
    commandsRan: 0,
    messagesProcessed: 0,
    startTime: Date.now()
};

// Event: Bot is ready and logged in
client.once('ready', async () => {
    console.log('Bot is ready, loading commands and events...');
    await readyHandler(client);
    await commandHandler(client);
    await eventHandler(client);
    
    // Initialize reminder scheduler
    initReminderScheduler(client);
    
    // Initialize poll scheduler
    initPollScheduler(client);
    
    console.log('[SUCCESS] Bot fully initialized!');
});

// Event: New member joins the server
client.on('guildMemberAdd', (member) => guildMemberAddHandler(member));

// Event: Handle slash commands
client.on('interactionCreate', async (interaction) => {
    // Handle button interactions
    if (interaction.isButton()) {
        // Button handling will be added by specific features
        return;
    }
    
    // Check if the interaction is a command
    if (!interaction.isChatInputCommand()) return;
    
    // Get the command
    const command = client.commands.get(interaction.commandName);
    
    // Check if command exists
    if (!command) {
        console.log(`[ERROR] Command not found: /${interaction.commandName}`);
        return;
    }
    
    try {
        // Execute the command
        await command.execute(interaction);
        
        // Track command usage
        client.stats.commandsRan++;
    } catch (error) {
        console.error(`[ERROR] Error executing /${interaction.commandName}:`, error);
        
        // Send error message to user
        const errorEmbed = {
            color: 0xFF0000,
            title: 'Error',
            description: 'An error occurred while executing this command.',
            fields: [
                {
                    name: 'Error',
                    value: error.message || 'Unknown error'
                }
            ],
            timestamp: new Date().toISOString()
        };
        
        // Check if reply has already been sent
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('[ERROR] Unhandled promise rejection:', error);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
    process.exit(1);
});

// Login to Discord with the bot token
client.login(config.DISCORD_TOKEN)
    .then(() => {
        console.log('[INFO] Attempting to log in...');
    })
    .catch((error) => {
        console.error('[ERROR] Failed to log in:', error);
        process.exit(1);
    });

export default client;
