import 'dotenv/config';
import { randomUUID, randomBytes } from 'crypto';
import { MessageFlags, Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
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
import { assertDiscordToken, assertOperatorAgreement, assertEncryptionKey, validatePostgresPoolMax, warnUnverifiedPlugins } from './utils/startupChecks.js';
import { closeAll as closeRedis } from './utils/redis.js';
import { startHealthServer, stopHealthServer } from './utils/healthServer.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger({ component: 'gateway' });

// Determine if we are running as a shard worker
const SHARD_ID = process.env.SHARD_ID ? parseInt(process.env.SHARD_ID, 10) : undefined;
const SHARD_COUNT = process.env.SHARD_COUNT ? process.env.SHARD_COUNT : undefined;
const IS_SHARD_WORKER = typeof SHARD_ID !== 'undefined' && !isNaN(SHARD_ID);

// Shard-scoped configuration overrides
const shardConfig = {
    queuePrefix: IS_SHARD_WORKER ? `${config.shard.queuePrefixBase}:shard-${SHARD_ID}` : config.queue.prefix,
    socketPath: IS_SHARD_WORKER ? `${config.shard.socketPathBase}-shard-${SHARD_ID}.sock` : '/tmp/apollo.sock',
    healthPort: IS_SHARD_WORKER ? 3000 + SHARD_ID : 3000,
    redisPrefix: IS_SHARD_WORKER ? `${config.shard.redisKeyPrefixBase}:shard-${SHARD_ID}` : config.shard.redisKeyPrefixBase
};

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

client.once('clientReady', async() => {
    logger.info('[SUCCESS] Bot is online! Logged in as ' + client.user.tag);
    logger.info('[INFO] Bot ID: ' + client.user.id);
    logger.info('[INFO] Serving ' + client.guilds.cache.size + ' server(s)');

    client.user.setActivity({ name: 'for new members join', type: 5 });

    logger.info('[INFO] Loading plugins...');
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
            if (!pluginIds || pluginIds.size === 0) {return;}
            
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
    logger.info('[INFO] Socket server listening on /tmp/apollo.sock');
    client.socketServer = socketServer;
    
    // Start health check server
    await startHealthServer(client);
    
    logger.info('[SUCCESS] Bot fully initialized!');
});

client.on('interactionCreate', async(interaction) => {
    // Handle message context menu commands (e.g., Translate)
    if (interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            logger.info('[ERROR] Context menu command not found:', interaction.commandName);
            return;
        }
        try {
            await command.execute(interaction);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
} catch (error) {
             logger.error('[ERROR] Error executing context menu command:', error);
             try {
                 if (interaction.deferred || interaction.replied) {
                     await interaction.editReply({ content: 'An error occurred.' });
                 } else {
                     await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral });
                 }
             } catch (e) {
                 logger.error('[ERROR] Failed to send error response:', e);
             }
        }
        return;
    }

    // Handle user context menu commands (e.g., Global Ban)
    if (interaction.isUserContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            logger.info('[ERROR] User context menu command not found:', interaction.commandName);
            return;
        }
        try {
            await command.execute(interaction);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
} catch (error) {
             logger.error('[ERROR] Error executing user context menu command:', error);
             try {
                 if (interaction.deferred || interaction.replied) {
                     await interaction.editReply({ content: 'An error occurred.' });
                 } else {
                     await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral });
                 }
             } catch (e) {
                 logger.error('[ERROR] Failed to send error response:', e);
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
        logger.info('[ERROR] Command not found: /' + interaction.commandName);
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
            logger.error('[ERROR] Error queueing /' + interaction.commandName + ':', error);
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
                logger.error('[ERROR] Failed to send error response:', e);
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
            logger.error('[ERROR] Failed to send error response:', e);
        }
    }
});

const RUN_MODE = process.env.RUN_MODE || 'gateway';

if (RUN_MODE === 'worker') {
    logger.info('[INFO] Starting in WORKER mode');
    try {
        assertOperatorAgreement(config.operator);
    } catch (error) {
        logger.error(error.message);
        process.exit(1);
    }
    const { startWorker } = await import('./worker.js');
    await startWorker();
} else {
    const { stopSpamTrackerCleanup } = await import('./utils/automod.js');

    if (config.queue.enabled) {
        registerProcessCommand();
        const { createRedisClient } = await import('./utils/redis.js');
        const pub = createRedisClient(`${shardConfig.redisPrefix}:eventbus-pub`);
        const sub = createRedisClient(`${shardConfig.redisPrefix}:eventbus-sub`);
        await pub.connect();
        await sub.connect();
        bus.enableCrossPod(pub, sub, uuid);
        logger.info('[INFO] Cross-pod EventBus enabled');
    }

    let cleanup = async() => {
        logger.info('[INFO] Shutting down...');
         
        try {
            // Flush analytics data
            logger.info('[INFO] Flushing pending analytics...');
            stopAnalyticsCollector();
             
            // Stop reminder scheduler (saves pending reminders)
            logger.info('[INFO] Stopping reminder scheduler...');
            stopReminderScheduler();
             
            // Stop poll scheduler (saves pending polls)
            logger.info('[INFO] Stopping poll scheduler...');
            stopPollScheduler();
             
            // Stop spam tracker cleanup
            logger.info('[INFO] Stopping spam tracker cleanup...');
            stopSpamTrackerCleanup();
             
            // Stop socket server
            logger.info('[INFO] Stopping socket server...');
            client.socketServer?.stop();
             
            // Disable all plugins
            logger.info('[INFO] Disabling plugins...');
            for (const [id] of pluginManager.plugins) {
                pluginManager.disablePlugin(id).catch(() => {});
            }
             
            // Close Discord client
            logger.info('[INFO] Closing Discord client...');
            if (client && client.destroy) {client.destroy();}
             
            // Close database connections
            logger.info('[INFO] Closing database connections...');
            await closeDatabase();
             
            // Close lock Redis connection
            logger.info('[INFO] Closing Redis lock connection...');
            await closeLockRedis();
             
            // Close queue connections
            logger.info('[INFO] Closing queue connections...');
            await closeQueues();
              
            // Close Redis connections
            logger.info('[INFO] Closing Redis connections...');
            await closeRedis();
              
            // Stop health server
            logger.info('[INFO] Stopping health server...');
            await stopHealthServer();
              
            logger.info('[SUCCESS] Graceful shutdown completed');
        } catch (error) {
            logger.error('[ERROR] Error during shutdown:', error);
        } finally {
            process.exit(0);
        }
    };

    const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30000;

    const shutdownWithTimeout = async() => {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('shutdown timeout')), SHUTDOWN_TIMEOUT_MS);
        });
        await Promise.race([cleanup(), timeout]);
    };

    process.on('unhandledRejection', (error) => {
        logger.error('[ERROR] Unhandled promise rejection:', error);
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });

    process.on('uncaughtException', (error) => {
        logger.error('[ERROR] Uncaught exception:', error);
        process.exit(1);
    });

    process.on('SIGTERM', async() => {
        logger.info('[INFO] SIGTERM received - graceful shutdown...');
        await shutdownWithTimeout();
    });
    process.on('SIGINT', async() => {
        logger.info('[INFO] SIGINT received - graceful shutdown...');
        await shutdownWithTimeout();
    });

    async function startGateway() {
        try {
            assertDiscordToken(config.DISCORD_TOKEN);
            assertEncryptionKey(config.ENCRYPTION_KEY);
            assertOperatorAgreement(config.operator);
            
            // Validate Postgres pool max against max_connections
            if (config.database.type === 'postgres') {
                await validatePostgresPoolMax(config.database.postgres.pool, config.database.postgres.connectionString);
            }
            
            // Warn if ALLOW_UNVERIFIED_PLUGINS is enabled in production
            warnUnverifiedPlugins();
        } catch (error) {
            logger.error(error.message);
            process.exit(1);
        }

        logger.info('[INFO] Attempting to log in...');
        client.login(config.DISCORD_TOKEN)
            .catch((error) => {
                logger.error('[ERROR] Failed to log in:', error);
                process.exit(1);
            });
    }

    if (config.queue.enabled) {
        const { createRedisClient } = await import('./utils/redis.js');
        const { tryAcquireLock, releaseLock, startHeartbeat, stopHeartbeat } = await import('./gateway/leader.js');

        const redis = createRedisClient('leader');
        await redis.connect();

        const isLeader = await tryAcquireLock(redis, config.podId);

        if (!isLeader) {
            logger.info('[Gateway] Another pod holds the leader lock. Standing by...');
            const pollInterval = setInterval(async() => {
                const canTakeOver = await tryAcquireLock(redis, config.podId);
                if (canTakeOver) {
                    clearInterval(pollInterval);
                    logger.info('[Gateway] Taking over as leader!');
                    startHeartbeat(redis, config.podId);
                    startGateway();
                }
            }, 5000);

            process.on('SIGTERM', async() => { clearInterval(pollInterval); });
            process.on('SIGINT', async() => { clearInterval(pollInterval); });
        } else {
            logger.info('[Gateway] Elected as leader!');
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

