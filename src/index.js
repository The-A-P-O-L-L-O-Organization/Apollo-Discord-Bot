import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { config } from './config/config.js';
import PluginManager from './core/PluginManager.js';
import EventBus from './core/EventBus.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.User,
        Partials.Reaction
    ]
});

client.commands = new Collection();
client.config = config;

client.stats = {
    commandsRan: 0,
    messagesProcessed: 0,
    startTime: Date.now()
};

const bus = new EventBus();
const pluginManager = new PluginManager(client, bus);

client.manager = pluginManager;
client.bus = bus;

const { trackCommand } = await import('./utils/analyticsCollector.js');

client.once('ready', async () => {
    console.log('[SUCCESS] Bot is online! Logged in as ' + client.user.tag);
    console.log('[INFO] Bot ID: ' + client.user.id);
    console.log('[INFO] Serving ' + client.guilds.cache.size + ' server(s)');

    client.user.setActivity({ name: 'for new members join', type: 5 });

    console.log('[INFO] Loading plugins...');
    await pluginManager.loadAll(config);
    console.log('[SUCCESS] Bot fully initialized!');
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.log('[ERROR] Command not found: /' + interaction.commandName);
        return;
    }

    try {
        await command.execute(interaction);
        client.stats.commandsRan++;
        if (interaction.guild) {
            trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
        }
    } catch (error) {
        console.error('[ERROR] Error executing /' + interaction.commandName + ':', error);

        const errorEmbed = {
            color: 0xFF0000,
            title: 'Error',
            description: 'An error occurred while executing this command.',
            fields: [{ name: 'Error', value: error.message || 'Unknown error' }],
            timestamp: new Date().toISOString()
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (e) {
            console.error('[ERROR] Failed to send error response:', e);
        }
    }
});

const { stopSpamTrackerCleanup } = await import('./utils/automod.js');

const cleanup = () => {
    console.log('[INFO] Shutting down...');
    stopSpamTrackerCleanup();
    for (const [id] of pluginManager.plugins) {
        pluginManager.disablePlugin(id).catch(() => {});
    }
    client.destroy();
    process.exit(0);
};

process.on('unhandledRejection', (error) => {
    console.error('[ERROR] Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
    process.exit(1);
});

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

console.log('[INFO] Attempting to log in...');
client.login(config.DISCORD_TOKEN)
    .catch((error) => {
        console.error('[ERROR] Failed to log in:', error);
        process.exit(1);
    });

export default client;
