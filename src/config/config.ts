// Bot Configuration
// This file contains all configurable settings for the Discord bot
// Uses ApolloConfig interface from @types/config for type safety

import type { ApolloConfig } from '../types/config.js';

function parseIntSafe(value: string | undefined, defaultValue: number): number {
    const n = parseInt(value ?? '', 10);
    return Number.isFinite(n) ? n : defaultValue;
}

function parseBoolSafe(value: string | undefined): boolean {
    return value === 'true';
}

function getEnv(key: string): string | undefined {
    return process.env[key];
}

const config = {
    // Discord Bot Token - Get from https://discord.com/developers/applications
    discord: {
        token: getEnv('DISCORD_TOKEN') ?? '',
        clientId: getEnv('CLIENT_ID') ?? '',
        clientSecret: getEnv('CLIENT_SECRET'),
        shardCount: getEnv('SHARD_COUNT') === 'auto' ? undefined : parseIntSafe(getEnv('SHARD_COUNT'), 1),
        gateway: undefined,
        intents: undefined,
        presence: undefined
    },

    // Bot Activity/Status
    activity: {
        name: 'for new members join',
        type: 'WATCHING'
    },

    // Welcome Message Settings
    welcome: {
        channelName: 'welcome',
        message: 'Welcome {user} to {server}! [SUCCESS]\n\n' +
            'We\'re glad to have you here!\n' +
            'Feel free to introduce yourself in #introductions.\n\n' +
            'Enjoy your stay!'
    },

    // Moderation Settings
    moderation: {
        defaultReason: 'No reason provided',
        muteRoleName: 'Muted',
        muteDuration: 3600000,
        maxMessagesPerPurge: 100,
        purgeCooldown: 5000,
        logModerationActions: true,
        moderationLogChannel: 'mod-logs'
    },

    // Warning System Settings (defaults, can be overridden per-server)
    warnings: {
        thresholds: {
            mute: 3,
            kick: 5,
            ban: 7
        },
        muteDuration: 3600000,
        dmOnWarn: true
    },

    // Auto-moderation Default Settings (can be configured per-server)
    automod: {
        enabled: false,
        bannedWords: [],
        maxMentions: 5,
        maxCapsPercent: 70,
        minCapsLength: 10,
        minAccountAge: 0,
        filterInvites: true,
        filterLinks: false,
        filterPhishingLinks: true,
        raidDetection: false,
        spamThreshold: 8,
        spamInterval: 10000,
        spamChannelOverrides: {},
        action: 'warn',
        aiModeration: false,
        nsfwFilter: false,
        useRedisSpamTracking: false,
        useRedisRaidDetection: false,
        useRedisThreatScore: false
    },

    // Leveling System Settings
    levels: {
        enabled: true,
        xpPerMessage: 20,
        xpCooldownMs: 60000,
        xpPerMinuteVoice: 10,
        roles: [],
        ignoredChannels: [],
        ignoredRoles: [],
        announceChannelId: undefined as string | undefined
    },

    // Ticket System Settings
    tickets: {
        enabled: true,
        categoryId: undefined as string | undefined,
        logChannelId: undefined as string | undefined,
        supportRoles: [],
        maxTicketsPerUser: 5,
        autoCloseAfterHours: 72,
        transcriptEnabled: true,
        channelPrefix: getEnv('TICKET_CHANNEL_PREFIX') ?? 'ticket-',
        welcomeMessage: getEnv('TICKET_WELCOME_MESSAGE') ?? 'Thanks for opening a ticket! A staff member will be with you shortly.'
    },

    // Logging Settings
    logging: {
        level: 'info',
        pretty: true,
        destination: 'stdout',
        defaultEvents: {
            messageDelete: false,
            messageEdit: false,
            memberJoin: false,
            memberLeave: false,
            roleChanges: false,
            voiceChanges: false
        },
        availableEvents: ['messageDelete', 'messageEdit', 'memberJoin', 'memberLeave', 'roleChanges', 'voiceChanges']
    },
    polls: {
        enabled: true,
        maxOptions: 10,
        maxDurationHours: 168,
        defaultDurationHours: 24,
        maxDuration: 168 * 60 * 60 * 1000 // 7 days in ms
    },

    // Integration Settings
    integrations: {
        youtube: {
            apiKey: getEnv('YOUTUBE_API_KEY') ?? ''
        },
        twitch: {
            clientId: getEnv('TWITCH_CLIENT_ID') ?? '',
            clientSecret: getEnv('TWITCH_CLIENT_SECRET') ?? ''
        },
        github: {
            token: getEnv('GITHUB_WEBHOOK_SECRET') ?? ''
        }
    },

    // Reaction Roles Settings
    reactionRoles: {
        enabled: true,
        maxRolesPerMessage: 20,
        maxReactionRolesPerGuild: 100
    },

    // Command Prefix (for legacy commands if needed)
    prefix: '!',

    // Plugin System Settings
    plugins: {
        enabled: ['utility', 'admin', 'moderation', 'tickets', 'automod', 'integrations', 'interlink'],
        disabled: [],
        paths: {
            core: './src/plugins',
            installed: './data/plugins'
        }
    },

    // Database Configuration
    database: {
        type: (getEnv('DB_TYPE') ?? 'sqlite') as 'sqlite' | 'postgres',
        sqlite: {
            filename: './data/apollo.sqlite'
        },
        postgres: {
            host: getEnv('DB_HOST') ?? 'localhost',
            port: parseIntSafe(getEnv('DB_PORT'), 5432),
            database: getEnv('DB_NAME') ?? 'apollo',
            user: getEnv('DB_USER') ?? 'postgres',
            password: getEnv('DB_PASSWORD') ?? '',
            ssl: parseBoolSafe(getEnv('DB_SSL')),
            pool: {
                min: parseIntSafe(getEnv('DB_POOL_MIN'), 5),
                max: parseIntSafe(getEnv('DB_POOL_MAX'), 50)
            }
        }
    },

    // Redis Configuration (shared)
    redis: {
        host: getEnv('REDIS_HOST') ?? 'localhost',
        port: parseIntSafe(getEnv('REDIS_PORT'), 6379),
        password: getEnv('REDIS_PASSWORD'),
        username: getEnv('REDIS_USERNAME'),
        db: parseIntSafe(getEnv('REDIS_DB'), 0),
        family: 4,
        tls: parseBoolSafe(getEnv('REDIS_TLS')),
        maxRetriesPerRequest: undefined,
        retryStrategy: undefined,
        enableReadyCheck: undefined,
        lazyConnect: undefined
    },

    // Interlink (Cross-Bot Communication)
    interlink: {
        enabled: parseBoolSafe(getEnv('INTERLINK_ENABLED')),
        host: getEnv('INTERLINK_BIND_HOST') ?? '127.0.0.1',
        port: parseIntSafe(getEnv('INTERLINK_HTTP_PORT'), 3456),
        authToken: getEnv('INTERLINK_AUTH_TOKEN'),
        rateLimit: {
            windowMs: 60000,
            maxRequests: 100
        }
    },

    // Queue Configuration
    queue: {
        enabled: parseBoolSafe(getEnv('QUEUE_ENABLED')),
        redis: {
            host: getEnv('REDIS_HOST') ?? 'localhost',
            port: parseIntSafe(getEnv('REDIS_PORT'), 6379),
            password: getEnv('REDIS_PASSWORD'),
            username: getEnv('REDIS_USERNAME'),
            prefix: getEnv('QUEUE_PREFIX') ?? 'apollo',
            db: parseIntSafe(getEnv('REDIS_DB'), 0),
            family: 4,
            tls: parseBoolSafe(getEnv('REDIS_TLS')),
            maxRetriesPerRequest: undefined,
            retryStrategy: undefined,
            enableReadyCheck: undefined,
            lazyConnect: undefined
        },
        prefix: getEnv('QUEUE_PREFIX') ?? 'apollo',
        name: getEnv('QUEUE_PREFIX') ?? 'apollo',
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential' as const, delay: 1000 },
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86400, count: 50 }
        },
        serializer: {
            serialize: () => Buffer.from(''),
            deserialize: () => ({})
        },
        shard: {
            queuePrefixBase: getEnv('QUEUE_PREFIX') ?? 'apollo',
            socketPathBase: '/tmp/apollo.sock',
            redisKeyPrefixBase: 'apollo'
        }
    },

    // Reminders Configuration
    reminders: {
        enabled: parseBoolSafe(getEnv('REMINDERS_ENABLED')),
        maxRemindersPerUser: parseIntSafe(getEnv('MAX_REMINDERS_PER_USER'), 10),
        defaultTimezone: getEnv('DEFAULT_TIMEZONE') ?? 'UTC',
        maxDuration: parseIntSafe(getEnv('MAX_REMINDER_DURATION'), 7 * 24 * 60 * 60 * 1000), // 7 days in ms
        checkInterval: parseIntSafe(getEnv('REMINDERS_CHECK_INTERVAL'), 30000)
    },

    // Operator Agreement (required to start the bot)
    operator: {
        agreed: false,
        contact: getEnv('OPERATOR_CONTACT') ?? '',
        requireAgreement: true,
        agreementUrl: 'https://github.com/CodeMaster013/Apollo-Discord-Bot/blob/main/legal/TOS.md',
        agreementVersion: '1.0.0',
        agreementMessageId: getEnv('OPERATOR_AGREEMENT_MESSAGE_ID'),
        agreementChannelId: getEnv('OPERATOR_AGREEMENT_CHANNEL_ID')
    },

    // Sharding Configuration
    shard: {
        queuePrefixBase: getEnv('QUEUE_PREFIX') ?? 'apollo',
        socketPathBase: '/tmp/apollo.sock',
        redisKeyPrefixBase: 'apollo'
    },

    // NSFW Detection Settings
    threshold: 0.6,
    deleteMessages: true,
    warnOnDetection: true,

    // Environment
    env: (getEnv('NODE_ENV') ?? 'development') as 'development' | 'production' | 'test',
    podId: getEnv('POD_ID') ?? getEnv('HOSTNAME') ?? 'default',
    ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY') ?? ''
} satisfies ApolloConfig;

export { config };
export default config;