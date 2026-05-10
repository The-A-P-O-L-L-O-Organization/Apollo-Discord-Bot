import 'dotenv/config';
import { randomUUID, randomBytes } from 'crypto';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { config } from './config/config.js';
import PluginManager from './core/PluginManager.js';
import EventBus from './core/EventBus.js';
import { closeAll as closeQueues } from './queue/queue.js';
import registerProcessCommand from './queue/jobs/processCommand.js';
import { trackCommand } from './utils/analyticsCollector.js';

const uuid = randomUUID?.() ?? randomBytes(16).toString('hex');

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

    const shouldQueue = config.queue.enabled && command.canQueue !== false;

    if (shouldQueue) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }
        const { enqueueCommand } = await import('./queue/jobs/processCommand.js');
        await enqueueCommand(interaction);
        client.stats.commandsRan++;
        if (interaction.guild) {
          trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
        }
      } catch (error) {
        console.error('[ERROR] Error queueing /' + interaction.commandName + ':', error);
        const errorEmbed = {
          color: 0xFF0000,
          title: 'Error',
          description: 'Failed to queue command. Is the queue available?',
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

const RUN_MODE = process.env.RUN_MODE || 'gateway';

if (RUN_MODE === 'worker') {
  console.log('[INFO] Starting in WORKER mode');
  const { startWorker } = await import('./worker.js');
  await startWorker();
} else {
  const { stopSpamTrackerCleanup } = await import('./utils/automod.js');

  if (config.queue.enabled) {
    registerProcessCommand();
    const { Redis } = await import('ioredis');
    const pub = new Redis({
      host: config.queue.redis.host,
      port: config.queue.redis.port,
      password: config.queue.redis.password || undefined,
    });
    const sub = new Redis({
      host: config.queue.redis.host,
      port: config.queue.redis.port,
      password: config.queue.redis.password || undefined,
    });
    bus.enableCrossPod(pub, sub, uuid);
    console.log('[INFO] Cross-pod EventBus enabled');
  }

  let cleanup = async () => {
    console.log('[INFO] Shutting down...');
    stopSpamTrackerCleanup();
    for (const [id] of pluginManager.plugins) {
      pluginManager.disablePlugin(id).catch(() => {});
    }
    if (client && client.destroy) client.destroy();
    await closeQueues();
    process.exit(0);
  };

  process.on('unhandledRejection', (error) => {
    console.error('[ERROR] Unhandled promise rejection:', error);
  });

  process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
    process.exit(1);
  });

  process.on('SIGTERM', () => cleanup());
  process.on('SIGINT', () => cleanup());

  async function startGateway() {
    console.log('[INFO] Attempting to log in...');
    client.login(config.DISCORD_TOKEN)
      .catch((error) => {
        console.error('[ERROR] Failed to log in:', error);
        process.exit(1);
      });
  }

  if (config.queue.enabled) {
    const { Redis } = await import('ioredis');
    const { tryAcquireLock, releaseLock, startHeartbeat, stopHeartbeat } = await import('./gateway/leader.js');

    const redis = new Redis({
      host: config.queue.redis.host,
      port: config.queue.redis.port,
      password: config.queue.redis.password || undefined,
    });

    const isLeader = await tryAcquireLock(redis, config.podId);

    if (!isLeader) {
      console.log('[Gateway] Another pod holds the leader lock. Standing by...');
      const pollInterval = setInterval(async () => {
        const canTakeOver = await tryAcquireLock(redis, config.podId);
        if (canTakeOver) {
          clearInterval(pollInterval);
          console.log('[Gateway] Taking over as leader!');
          startHeartbeat(redis, config.podId);
          startGateway();
        }
      }, 5000);

      process.on('SIGTERM', () => { clearInterval(pollInterval); redis.quit(); cleanup(); });
      process.on('SIGINT', () => { clearInterval(pollInterval); redis.quit(); cleanup(); });
    } else {
      console.log('[Gateway] Elected as leader!');
      startHeartbeat(redis, config.podId);
      startGateway();

      const origCleanup = cleanup;
      cleanup = async () => {
        stopHeartbeat();
        await releaseLock(redis, config.podId);
        await redis.quit();
        await origCleanup();
      };
    }
  } else {
    startGateway();
  }
}

export default client;
