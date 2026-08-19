import 'dotenv/config';
import { randomUUID, randomBytes } from 'crypto';
import { MessageFlags, Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'http';
import { config } from './config/config.js';
import PluginManager from './core/PluginManager.js';
import EventBus from './core/EventBus.js';
import { closeAll as closeQueues } from './queue/queue.js';
import registerProcessCommand from './queue/jobs/processCommand.js';
import { trackCommand, stopAnalyticsCollector } from './utils/analyticsCollector.js';
import { stopReminderScheduler } from './utils/reminderScheduler.js';
import { stopPollScheduler } from './utils/pollScheduler.js';
import { close as closeDatabase, startWalCheckpointInterval } from './utils/db.js';
import { closeLockRedis } from './utils/lock.js';
import { safeError } from './utils/safeError.js';
import { assertDiscordToken, assertOperatorAgreement } from './utils/startupChecks.js';
import { closeAll as closeRedis, healthCheck as redisHealthCheck } from './utils/redis.js';

const uuid = randomUUID?.() ?? randomBytes(16).toString('hex');

// Base intents - minimal set required for core bot functionality
// Plugins can declare additional required intents via static requiredIntents getter
const baseIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
];

const basePartials = [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.Reaction
];

const client = new Client({
    intents: baseIntents,
    partials: basePartials
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

// Health check HTTP server
let healthServer = null;

async function startHealthServer() {
    const port = process.env.HEALTH_PORT || 8080;
    const host = process.env.HEALTH_HOST || '127.0.0.1';
    
    healthServer = createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        
        if (url.pathname === '/healthz' || url.pathname === '/readyz') {
            const isReady = client.isReady();
            const redisHealth = await redisHealthCheck();
            const allRedisHealthy = Object.values(redisHealth).every(r => r.status === 'healthy');
            
            const status = isReady && allRedisHealthy ? 200 : 503;
            
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: status === 200 ? 'ok' : 'degraded',
                timestamp: new Date().toISOString(),
                discord: isReady ? 'connected' : 'disconnected',
                redis: redisHealth,
                uptimeMs: Date.now() - client.stats.startTime
            }));
        } else if (url.pathname === '/metrics') {
            // Redirect to Interlink metrics if available, or return basic metrics
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('# Metrics available at /metrics on Interlink port\n');
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });
    
    await new Promise((resolve, reject) => {
        healthServer.listen(port, host, resolve);
        healthServer.once('error', reject);
    });
    
    console.log(`[INFO] Health server listening on ${host}:${port}`);
}

async function stopHealthServer() {
    if (healthServer) {
        await new Promise(resolve => healthServer.close(resolve));
        healthServer = null;
    }
}

client.once('clientReady', async() => {
    console.log('[SUCCESS] Bot is online! Logged in as ' + client.user.tag);
    console.log('[INFO] Bot ID: ' + client.user.id);
    console.log('[INFO] Serving ' + client.guilds.cache.size + ' server(s)');

    client.user.setActivity({ name: 'for new members join', type: 5 });

    console.log('[INFO] Loading plugins...');
    await pluginManager.loadAll(config);
    
    // Start WAL checkpoint interval for SQLite
    startWalCheckpointInterval();

    const EVENT_FORWARD = {
        ready: 'events:ready',
        messageCreate: 'events:messageCreate',
        messageDelete: 'events:messageDelete',
        messageUpdate: 'events:messageUpdate',
        guildMemberAdd: 'events:guildMemberAdd',
        guildMemberRemove: 'events:guildMemberRemove',
        channelCreate: 'events:channelCreate'
    };

    function serializeEventArgs(args) {
        return args.map(arg => {
            if (!arg) { return null; }
            if (typeof arg.id === 'string') {
                const out = { id: arg.id };
                if (typeof arg.name === 'string') { out.name = arg.name; }
                if (arg.guildId) { out.guildId = arg.guildId; }
                if (arg.content !== undefined) { out.content = arg.content; }
                if (arg.author?.id) { out.authorId = arg.author.id; }
                return out;
            }
            return String(arg);
        });
    }

    for (const [eventName, capability] of Object.entries(EVENT_FORWARD)) {
        client.on(eventName, (...args) => {
            const pluginIds = pluginManager._capabilityIndex.get(capability);
            if (!pluginIds || pluginIds.size === 0) return;
            
            const payload = serializeEventArgs(args);
            for (const id of pluginIds) {
                pluginManager.workerHost.send(id, {
                    kind: 'request',
                    method: 'event:emit',
                    payload: { event: capability, data: payload },
                    correlationId: `evt-${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                });
            }
        });
    }

    const { SocketServer } = await import('./cli/socket-server.js');
    const socketServer = new SocketServer(pluginManager);
    await socketServer.start();
    console.log('[INFO] Socket server listening on /tmp/apollo.sock');
    client.socketServer = socketServer;
    
    // Start health check server
    await startHealthServer();
    
    console.log('[SUCCESS] Bot fully initialized!');
});

client.on('interactionCreate', async(interaction) => {
    // Handle message context menu commands (e.g., Translate)
    if (interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.log('[ERROR] Context menu command not found:', interaction.commandName);
            return;
        }
        try {
            await command.execute(interaction);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
        } catch (error) {
            console.error('[ERROR] Error executing context menu command:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred.' });
                } else {
                    await interaction.reply({ content: 'An error occurred.', ephemeral: true });
                }
            } catch (e) {
                console.error('[ERROR] Failed to send error response:', e);
            }
        }
        return;
    }

    // Handle user context menu commands (e.g., Global Ban)
    if (interaction.isUserContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.log('[ERROR] User context menu command not found:', interaction.commandName);
            return;
        }
        try {
            await command.execute(interaction);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
        } catch (error) {
            console.error('[ERROR] Error executing user context menu command:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred.' });
                } else {
                    await interaction.reply({ content: 'An error occurred.', ephemeral: true });
                }
            } catch (e) {
                console.error('[ERROR] Failed to send error response:', e);
            }
        }
        return;
    }

    // Let modal submits pass through for awaitModalSubmit collectors
    if (interaction.isModalSubmit()) {
        return;
    }

    if (!interaction.isChatInputCommand()) {return;}

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
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
        const errorEmbed = {
            color: 0xFF0000,
            title: 'Error',
            description: 'An error occurred while executing this command.',
            fields: [{ name: 'Error', value: safeError(error) }],
            timestamp: new Date().toISOString()
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            console.error('[ERROR] Failed to send error response:', e);
        }
    }
});

const RUN_MODE = process.env.RUN_MODE || 'gateway';

if (RUN_MODE === 'worker') {
    console.log('[INFO] Starting in WORKER mode');
    try {
        assertOperatorAgreement(config.operator);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    const { startWorker } = await import('./worker.js');
    await startWorker();
} else {
    const { stopSpamTrackerCleanup } = await import('./utils/automod.js');

    if (config.queue.enabled) {
        registerProcessCommand();
        const { getRedis } = await import('./utils/redis.js');
        const pub = getRedis('eventbus-pub');
        const sub = getRedis('eventbus-sub');
        await pub.connect();
        await sub.connect();
        bus.enableCrossPod(pub, sub, uuid);
        console.log('[INFO] Cross-pod EventBus enabled');
    }

     let cleanup = async() => {
         console.log('[INFO] Shutting down...');
         
         try {
             // Flush analytics data
             console.log('[INFO] Flushing pending analytics...');
             stopAnalyticsCollector();
             
             // Stop reminder scheduler (saves pending reminders)
             console.log('[INFO] Stopping reminder scheduler...');
             stopReminderScheduler();
             
             // Stop poll scheduler (saves pending polls)
             console.log('[INFO] Stopping poll scheduler...');
             stopPollScheduler();
             
             // Stop spam tracker cleanup
             console.log('[INFO] Stopping spam tracker cleanup...');
             stopSpamTrackerCleanup();
             
             // Stop socket server
             console.log('[INFO] Stopping socket server...');
             client.socketServer?.stop();
             
             // Disable all plugins
             console.log('[INFO] Disabling plugins...');
             for (const [id] of pluginManager.plugins) {
                 pluginManager.disablePlugin(id).catch(() => {});
             }
             
             // Close Discord client
             console.log('[INFO] Closing Discord client...');
             if (client && client.destroy) {client.destroy();}
             
             // Close database connections
             console.log('[INFO] Closing database connections...');
             await closeDatabase();
             
             // Close lock Redis connection
             console.log('[INFO] Closing Redis lock connection...');
             await closeLockRedis();
             
// Close queue connections
              console.log('[INFO] Closing queue connections...');
              await closeQueues();
              
              // Close Redis connections
              console.log('[INFO] Closing Redis connections...');
              await closeRedis();
              
              // Stop health server
              console.log('[INFO] Stopping health server...');
              await stopHealthServer();
              
              console.log('[SUCCESS] Graceful shutdown completed');
         } catch (error) {
             console.error('[ERROR] Error during shutdown:', error);
         } finally {
             process.exit(0);
         }
     };

    process.on('unhandledRejection', (error) => {
        console.error('[ERROR] Unhandled promise rejection:', error);
    });

    process.on('uncaughtException', (error) => {
        console.error('[ERROR] Uncaught exception:', error);
        process.exit(1);
    });

     process.on('SIGTERM', async () => {
         console.log('[INFO] SIGTERM received - graceful shutdown...');
         await cleanup();
     });
     process.on('SIGINT', async () => {
         console.log('[INFO] SIGINT received - graceful shutdown...');
         await cleanup();
     });

    async function startGateway() {
        try {
            assertDiscordToken(config.DISCORD_TOKEN);
            assertOperatorAgreement(config.operator);
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }

        console.log('[INFO] Attempting to log in...');
        client.login(config.DISCORD_TOKEN)
            .catch((error) => {
                console.error('[ERROR] Failed to log in:', error);
                process.exit(1);
            });
    }

    if (config.queue.enabled) {
        const { getRedis } = await import('./utils/redis.js');
        const { tryAcquireLock, releaseLock, startHeartbeat, stopHeartbeat } = await import('./gateway/leader.js');

        const redis = getRedis('leader');
        await redis.connect();

        const isLeader = await tryAcquireLock(redis, config.podId);

        if (!isLeader) {
            console.log('[Gateway] Another pod holds the leader lock. Standing by...');
            const pollInterval = setInterval(async() => {
                const canTakeOver = await tryAcquireLock(redis, config.podId);
                if (canTakeOver) {
                    clearInterval(pollInterval);
                    console.log('[Gateway] Taking over as leader!');
                    startHeartbeat(redis, config.podId);
                    startGateway();
                }
            }, 5000);

             process.on('SIGTERM', async () => { clearInterval(pollInterval); });
             process.on('SIGINT', async () => { clearInterval(pollInterval); });
        } else {
            console.log('[Gateway] Elected as leader!');
            startHeartbeat(redis, config.podId);
            startGateway();

            const origCleanup = cleanup;
            cleanup = async() => {
                stopHeartbeat();
                await releaseLock(redis, config.podId);
                await origCleanup();
            };
        }
    } else {
        startGateway();
    }
}

export default client;
