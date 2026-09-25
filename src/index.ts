import 'dotenv/config';
import { randomUUID, randomBytes } from 'node:crypto';
import { MessageFlags, Client, GatewayIntentBits, Collection, Partials, type ChatInputCommandInteraction, type Interaction } from 'discord.js';
import type { Redis as RedisType } from 'ioredis';
import { config } from './config/config.js';
import PluginManager from './core/PluginManager.js';
import EventBus from './core/EventBus.js';
import { createRequest } from './core/worker/rpc.js';
import { closeAll as closeQueues } from './queue/queue.js';
import registerProcessCommand from './queue/jobs/processCommand.js';
import { trackCommand, stopAnalyticsCollector } from './utils/analyticsCollector.js';
import { stopSpamTrackerCleanup } from './utils/automod.js';
import { stopReminderScheduler } from './utils/reminderScheduler.js';
import { stopPollScheduler } from './utils/pollScheduler.js';
import { close as closeDatabase, startWalCheckpointInterval } from './utils/db.js';
import { closeLockRedis } from './utils/lock.js';
import { safeError } from './utils/safeError.js';
import { assertDiscordToken, assertOperatorAgreement, assertEncryptionKey, validatePostgresPoolMax, warnUnverifiedPlugins } from './utils/startupChecks.js';
import { createRedisClient, closeRedisClient as closeRedis } from './utils/redis.js';
import { startHealthServer, stopHealthServer } from './utils/healthServer.js';
import { createLogger } from './utils/logger.js';
import type { TypedClient } from './core/PluginManager.js';
import { SocketServer } from './cli/socket-server.js';
import { i18n } from './i18n/index.js';
import { startLocaleWatcher } from './i18n/watchLocales.js';
import { subscribeInvalidation } from './i18n/localeCache.js';
import { acquireGlobalLock, releaseLock, startHeartbeat, stopHeartbeat, GLOBAL_LEADER_LOCK_KEY } from './gateway/leader.js';
import type { ApolloClient } from './types/shared.js';
import type { CommandModule } from './types/discord.js';

const logger = createLogger({ component: 'gateway' });

const SHARD_ID = process.env['SHARD_ID'] ? parseInt(process.env['SHARD_ID'], 10) : undefined;
const IS_SHARD_WORKER = typeof SHARD_ID !== 'undefined' && !isNaN(SHARD_ID);

const shardConfig = {
    queuePrefix: IS_SHARD_WORKER ? `${config.shard.queuePrefixBase}:shard-${SHARD_ID}` : config.queue.prefix,
    socketPath: IS_SHARD_WORKER ? `${config.shard.socketPathBase}-shard-${SHARD_ID}.sock` : '/tmp/apollo.sock',
    healthPort: IS_SHARD_WORKER && typeof SHARD_ID === 'number' ? 3000 + SHARD_ID : 3000,
    redisPrefix: IS_SHARD_WORKER ? `${config.shard.redisKeyPrefixBase}:shard-${SHARD_ID}` : config.shard.redisKeyPrefixBase
};

const uuid = randomUUID?.() ?? randomBytes(16).toString('hex');

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
}) as ApolloClient;

client.commands = new Collection<string, CommandModule>();
client.config = config;

client.stats = {
    commandsRan: 0,
    messagesProcessed: 0,
    startTime: Date.now()
};

const bus = new EventBus();
const pluginManager = new PluginManager(client as unknown as TypedClient, bus);

client.manager = pluginManager;
client.bus = bus;

let socketServer: SocketServer | undefined;

client.once('clientReady', () => { void onClientReady(); });

async function onClientReady(): Promise<void> {
    logger.info('[SUCCESS] Bot is online! Logged in as ' + client.user.tag);
    logger.info('[INFO] Bot ID: ' + client.user.id);
    logger.info('[INFO] Serving ' + client.guilds.cache.size + ' server(s)');

    client.user.setActivity({ name: 'for new members join', type: 5 });

    logger.info('[INFO] Loading plugins...');
    await pluginManager.loadAll(config);

    startWalCheckpointInterval();

    const EVENT_FORWARD: Record<string, string> = {
        ready: 'events:ready',
        messageCreate: 'events:messageCreate',
        messageDelete: 'events:messageDelete',
        messageUpdate: 'events:messageUpdate',
        guildMemberAdd: 'events:guildMemberAdd',
        guildMemberRemove: 'events:guildMemberRemove',
        channelCreate: 'events:channelCreate'
    };

    function serializeEventArgs(args: unknown[]): unknown[] {
        return args.map((arg) => {
            if (!arg) { return null; }
            if (typeof arg === 'object') {
                const obj = arg as Record<string, unknown>;
                if (typeof obj['id'] === 'string') {
                    const out: Record<string, unknown> = { id: obj['id'] };
                    if (typeof obj['name'] === 'string') { out['name'] = obj['name']; }
                    if (obj['guildId']) { out['guildId'] = obj['guildId']; }
                    if (obj['content'] !== undefined) { out['content'] = obj['content']; }
                    const author = obj['author'];
                    if (author && typeof author === 'object' && typeof (author as Record<string, unknown>)['id'] === 'string') {
                        out['authorId'] = (author as Record<string, unknown>)['id'];
                    }
                    return out;
                }
            }
            const primitive = arg as string | number | boolean;
            return String(primitive);
        });
    }

    for (const [eventName, capability] of Object.entries(EVENT_FORWARD)) {
        client.on(eventName, (...args: unknown[]) => {
            const pluginIds = pluginManager._capabilityIndex.get(capability);
            if (!pluginIds || pluginIds.size === 0) { return; }

            const payload = serializeEventArgs(args);
            for (const id of pluginIds) {
                pluginManager.workerHost.send(id, createRequest(id, 'event:emit', { event: capability, data: payload }));
            }
        });
    }

    socketServer = new SocketServer(pluginManager);
    await socketServer.start();
    logger.info('[INFO] Socket server listening on /tmp/apollo.sock');
    client.socketServer = socketServer;

    await startHealthServer(client);

    logger.info('[SUCCESS] Bot fully initialized!');
}

async function executeCommand(command: CommandModule, interaction: ChatInputCommandInteraction): Promise<void> {
    await command.execute(interaction);
    client.stats.commandsRan++;
    if (interaction.guild) {
        trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
    }
}

client.on('interactionCreate', (interaction) => { void handleInteraction(interaction); });

async function handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName) as CommandModule | undefined;
        if (!command) {
            logger.info('[ERROR] Context menu command not found: ' + interaction.commandName);
            return;
        }
        try {
            await executeCommand(command, interaction as unknown as ChatInputCommandInteraction);
        } catch (error) {
            logger.error({ err: error as Error }, '[ERROR] Error executing context menu command');
            try {
                const errorMessage = i18n.tFor(interaction, 'common:error', { defaultValue: 'An error occurred.' });
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: errorMessage });
                } else {
                    await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
                }
            } catch (e) {
                logger.error({ err: e as Error }, '[ERROR] Failed to send error response');
            }
        }
        return;
    }

    if (interaction.isUserContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName) as CommandModule | undefined;
        if (!command) {
            logger.info('[ERROR] User context menu command not found: ' + interaction.commandName);
            return;
        }
        try {
            await executeCommand(command, interaction as unknown as ChatInputCommandInteraction);
        } catch (error) {
            logger.error({ err: error as Error }, '[ERROR] Error executing user context menu command');
            try {
                const errorMessage = i18n.tFor(interaction, 'common:error', { defaultValue: 'An error occurred.' });
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: errorMessage });
                } else {
                    await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
                }
            } catch (e) {
                logger.error({ err: e as Error }, '[ERROR] Failed to send error response');
            }
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        return;
    }

    if (!interaction.isChatInputCommand()) { return; }

    const command = client.commands.get(interaction.commandName) as CommandModule | undefined;
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
            await enqueueCommand(interaction as unknown as Parameters<typeof enqueueCommand>[0]);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
        } catch (error) {
            logger.error({ err: error as Error }, '[ERROR] Error queueing /' + interaction.commandName);
            const errorEmbed = {
                color: 0xFF0000,
                title: i18n.tFor(interaction, 'common:errorTitle', { defaultValue: 'Error' }),
                description: i18n.tFor(interaction, 'common:queueFailure', { defaultValue: 'Failed to queue command. Is the queue available?' }),
                timestamp: new Date().toISOString()
            };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (e) {
                logger.error({ err: e as Error }, '[ERROR] Failed to send error response');
            }
        }
        return;
    }

    try {
        await executeCommand(command, interaction);
    } catch (error) {
        const errorEmbed = {
            color: 0xFF0000,
            title: i18n.tFor(interaction, 'common:errorTitle', { defaultValue: 'Error' }),
            description: i18n.tFor(interaction, 'common:error', { defaultValue: 'An error occurred while executing this command.' }),
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
            logger.error({ err: e as Error }, '[ERROR] Failed to send error response');
        }
    }
}

const RUN_MODE = process.env['RUN_MODE'] ?? 'gateway';

let eventPub: RedisType | undefined;
let eventSub: RedisType | undefined;
let leaderRedis: RedisType | undefined;

if (RUN_MODE === 'worker') {
    logger.info('[INFO] Starting in WORKER mode');
    try {
        assertOperatorAgreement(config.operator);
    } catch (error) {
        logger.error((error as Error).message);
        process.exit(1);
    }
    const { startWorker } = await import('./worker.js');
    await startWorker();
} else {
    if (config.queue.enabled) {
        registerProcessCommand();
        const pub = createRedisClient(`${shardConfig.redisPrefix}:eventbus-pub`);
        const sub = createRedisClient(`${shardConfig.redisPrefix}:eventbus-sub`);
        await pub.connect();
        await sub.connect();
        eventPub = pub;
        eventSub = sub;
        bus.enableCrossPod(
            { publish: (channel: string, message: string) => pub.publish(channel, message) },
            {
                subscribe: async (channel: string): Promise<void> => { await sub.subscribe(channel); },
                unsubscribe: async (channel: string): Promise<void> => { await sub.unsubscribe(channel); },
                on: (_event: 'message', listener: (_channel: string, _message: string) => void): void => { sub.on('message', listener); }
            },
            uuid
        );
        logger.info('[INFO] Cross-pod EventBus enabled');
    }

    let cleanup: () => Promise<void> = async () => {
        logger.info('[INFO] Shutting down...');

        try {
            logger.info('[INFO] Flushing pending analytics...');
            stopAnalyticsCollector();

            logger.info('[INFO] Stopping reminder scheduler...');
            stopReminderScheduler();

            logger.info('[INFO] Stopping poll scheduler...');
            stopPollScheduler();

            logger.info('[INFO] Stopping spam tracker cleanup...');
            stopSpamTrackerCleanup();

            logger.info('[INFO] Stopping socket server...');
            await socketServer?.stop();

            logger.info('[INFO] Disabling plugins...');
            for (const [id] of pluginManager.plugins) {
                pluginManager.disablePlugin(id).catch(() => { /* plugin already stopping */ });
            }

            logger.info('[INFO] Closing Discord client...');
            void client.destroy();

            logger.info('[INFO] Closing database connections...');
            await closeDatabase();

            logger.info('[INFO] Closing Redis lock connection...');
            await closeLockRedis();

            logger.info('[INFO] Closing queue connections...');
            await closeQueues();

            logger.info('[INFO] Closing Redis connections...');
            await closeRedis(eventPub);
            await closeRedis(eventSub);
            await closeRedis(leaderRedis);

            logger.info('[INFO] Stopping health server...');
            await stopHealthServer();

            logger.info('[SUCCESS] Graceful shutdown completed');
        } catch (error) {
            logger.error({ err: error as Error }, '[ERROR] Error during shutdown');
        } finally {
            process.exit(0);
        }
    };

    const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env['SHUTDOWN_TIMEOUT_MS'] ?? '', 10) || 30000;

    const shutdownWithTimeout = async (): Promise<void> => {
        const timeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('shutdown timeout')), SHUTDOWN_TIMEOUT_MS);
        });
        await Promise.race([cleanup(), timeout]);
    };

    process.on('unhandledRejection', (error: unknown) => {
        logger.error({ err: error as Error }, '[ERROR] Unhandled promise rejection');
        if (process.env['NODE_ENV'] === 'production') {
            process.exit(1);
        }
    });

    process.on('uncaughtException', (error: Error) => {
        logger.error({ err: error }, '[ERROR] Uncaught exception');
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        logger.info('[INFO] SIGTERM received - graceful shutdown...');
        void shutdownWithTimeout().catch(() => process.exit(1));
    });
    process.on('SIGINT', () => {
        logger.info('[INFO] SIGINT received - graceful shutdown...');
        void shutdownWithTimeout().catch(() => process.exit(1));
    });

    async function startGateway(): Promise<void> {
        try {
            assertDiscordToken(config.discord.token);
            assertEncryptionKey(config.ENCRYPTION_KEY);
            assertOperatorAgreement(config.operator);
            await i18n.init();
            if (process.env['NODE_ENV'] !== 'production') {
                try {
                    startLocaleWatcher();
                } catch (error: unknown) {
                    logger.warn({ err: error as Error }, '[WARN] Locale watcher failed to start');
                }
            }
            subscribeInvalidation(bus);

            if (config.database.type === 'postgres') {
                const pg = config.database.postgres;
                const connectionString = `postgresql://${encodeURIComponent(pg.user)}:${encodeURIComponent(pg.password)}@${pg.host}:${pg.port}/${pg.database}`;
                await validatePostgresPoolMax(pg.pool, connectionString);
            }

            warnUnverifiedPlugins();
        } catch (error) {
            logger.error((error as Error).message);
            process.exit(1);
        }

        logger.info('[INFO] Attempting to log in...');
        client.login(config.discord.token)
            .catch((error: unknown) => {
                logger.error({ err: error as Error }, '[ERROR] Failed to log in');
                process.exit(1);
            });
    }

    if (config.queue.enabled) {
        const redis = createRedisClient('leader');
        await redis.connect();
        leaderRedis = redis;

        const isLeader = await acquireGlobalLock(redis, config.podId);

        if (!isLeader) {
            logger.info('[Gateway] Another pod holds the leader lock. Standing by...');
            const pollInterval = setInterval(() => { void pollForLeadership(); }, 5000);

            async function pollForLeadership(): Promise<void> {
                const canTakeOver = await acquireGlobalLock(redis, config.podId);
                if (canTakeOver) {
                    clearInterval(pollInterval);
                    logger.info('[Gateway] Taking over as leader!');
                    void startHeartbeat(redis, GLOBAL_LEADER_LOCK_KEY, config.podId);
                    void startGateway();
                }
            }

            process.on('SIGTERM', () => { clearInterval(pollInterval); });
            process.on('SIGINT', () => { clearInterval(pollInterval); });
        } else {
            logger.info('[Gateway] Elected as leader!');
            void startHeartbeat(redis, GLOBAL_LEADER_LOCK_KEY, config.podId);
            void startGateway();

            const origCleanup = cleanup;
            cleanup = async () => {
                stopHeartbeat();
                await releaseLock(redis, GLOBAL_LEADER_LOCK_KEY, config.podId);
                await origCleanup();
            };
        }
    } else {
        void startGateway();
    }
}

export default client;
