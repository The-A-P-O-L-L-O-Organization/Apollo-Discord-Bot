// Bot Configuration
// This file contains all configurable settings for the Discord bot

function parseIntSafe(value, defaultValue) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : defaultValue;
}

export const config = {
    // Discord Bot Token - Get from https://discord.com/developers/applications
    DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
    
    // Discord Client ID - Get from https://discord.com/developers/applications
    CLIENT_ID: process.env.CLIENT_ID || '',
    
    // Discord Guild ID (for dev guild-specific command deployment)
    GUILD_ID: process.env.GUILD_ID || '',

    // Encryption key for data at rest (32-byte base64)
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',

    // Bot Activity/Status
    activity: {
        name: 'for new members join',
        type: 'WATCHING'
    },
    
    // Welcome Message Settings
    welcome: {
        // Channel name where welcome messages will be sent
        // The bot will look for a channel with this name
        channelName: 'welcome',
        
        // Welcome message template
        message: 'Welcome {user} to {server}! [SUCCESS]\n\n' +
                'We\'re glad to have you here!\n' +
                'Feel free to introduce yourself in #introductions.\n\n' +
                'Enjoy your stay!'
    },
    
    // Moderation Settings
    moderation: {
        // Default reason for moderation actions
        defaultReason: 'No reason provided',
        
        // Mute role configuration
        muteRoleName: 'Muted',
        muteDuration: 3600000, // 1 hour in milliseconds
        
        // Purge settings
        maxMessagesPerPurge: 100,
        purgeCooldown: 5000, // 5 seconds between purges
        
        // Action logging
        logModerationActions: true,
        moderationLogChannel: 'mod-logs'
    },
    
    // Warning System Settings (defaults, can be overridden per-server)
    warnings: {
        // Auto-punishment thresholds
        thresholds: {
            mute: 3,      // Auto-mute at 3 warnings
            kick: 5,      // Auto-kick at 5 warnings
            ban: 7        // Auto-ban at 7 warnings
        },
        // Duration for auto-mute punishment (in milliseconds)
        muteDuration: 3600000, // 1 hour
        // Whether to DM users when warned
        dmOnWarn: true
    },
    
    // Auto-moderation Default Settings (can be configured per-server)
    automod: {
        // Whether automod is enabled by default
        enabled: false,
        // List of banned words (servers should configure their own)
        bannedWords: [],
        // Maximum mentions allowed in a single message
        maxMentions: 5,
        // Maximum percentage of caps allowed (0-100)
        maxCapsPercent: 70,
        // Minimum message length to check for caps
        minCapsLength: 10,
        // Minimum account age in days (0 to disable)
        minAccountAge: 0,
        // Filter Discord invite links
        filterInvites: true,
        // Filter external links
        filterLinks: false,
        // Filter phishing links (Discord nitro scams, etc.)
        filterPhishingLinks: true,
        // Raid detection in automod (detects coordinated attacks)
        raidDetection: false,
        // Spam detection: max messages in interval
        spamThreshold: 5,
        // Spam detection: time interval in milliseconds
        spamInterval: 5000,
        // Action to take: 'warn', 'mute', 'kick', 'delete'
        action: 'warn',
        // AI-powered moderation (OpenAI Moderation API)
        aiModeration: false,
        // NSFW image detection in attachments
        nsfwFilter: false,
        // Use Redis-backed spam tracking when available (survives restarts, works across pods)
        useRedisSpamTracking: false,
        // Use Redis-backed raid detection when available
        useRedisRaidDetection: false
    },

    // Leveling System Settings
    levels: {
        // Whether XP is awarded for messages
        enabled: true,
        // Cooldown between XP awards per user (milliseconds)
        cooldown: 60000,
        // Random XP awarded per message
        minXp: 15,
        maxXp: 25,
        // Announce level-ups in the channel
        announceLevelUp: true
    },
    
    // Ticket System Settings
    tickets: {
        // Default category name for ticket channels
        categoryName: 'Support Tickets',
        // Naming format for ticket channels
        channelPrefix: 'ticket-',
        // Welcome message in new tickets
        welcomeMessage: 'Thank you for creating a ticket! Support will be with you shortly.\n\nPlease describe your issue in detail.'
    },
    
    // Logging Settings
    logging: {
        // Events that can be logged
        availableEvents: [
            'messageDelete',
            'messageEdit', 
            'memberJoin',
            'memberLeave',
            'roleChanges',
            'voiceChanges'
        ],
        // Default events to enable
        defaultEvents: {
            messageDelete: true,
            messageEdit: true,
            memberJoin: true,
            memberLeave: true,
            roleChanges: true,
            voiceChanges: false
        }
    },
    
    // Reminder Settings
    reminders: {
        // Check interval in milliseconds
        checkInterval: 30000, // 30 seconds
        // Maximum reminder duration (30 days)
        maxDuration: 30 * 24 * 60 * 60 * 1000
    },
    
    // Poll Settings
    polls: {
        // Default poll duration in milliseconds (24 hours)
        defaultDuration: 24 * 60 * 60 * 1000,
        // Maximum poll duration (7 days)
        maxDuration: 7 * 24 * 60 * 60 * 1000,
        // Maximum number of options
        maxOptions: 10
    },

    // Integration Settings
    integrations: {
        webhookPort: parseIntSafe(process.env.INTEGRATIONS_WEBHOOK_PORT, 0),
        githubSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
        twitchClientId: process.env.TWITCH_CLIENT_ID || '',
        twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || '',
        youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
        pollInterval: {
            twitch: parseIntSafe(process.env.INTEGRATIONS_POLL_TWITCH, 300000),
            youtube: parseIntSafe(process.env.INTEGRATIONS_POLL_YOUTUBE, 300000),
            rss: parseIntSafe(process.env.INTEGRATIONS_POLL_RSS, 900000)
        }
    },
    
    // Reaction Roles Settings
    reactionRoles: {
        // Whether to DM users when they get a role
        dmOnRole: false
    },
    
    // Command Prefix (for legacy commands if needed)
    prefix: '!',

    // Plugin System Settings
    plugins: {
        enabled: ['utility', 'admin', 'moderation', 'tickets', 'automod', 'integrations', 'interlink'],
        directory: './src/plugins',
        optionalDirectory: './data/plugins',
        registryFile: './data/plugins/registry.json'
    },

    // Database Configuration
    database: {
        // Set to 'postgres' or 'sqlite'
        type: process.env.DB_TYPE || 'sqlite',
        postgres: {
            connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/apollo',
            pool: {
                min: parseIntSafe(process.env.DB_POOL_MIN, 5),
                max: parseIntSafe(process.env.DB_POOL_MAX, 50),
                acquireTimeoutMillis: 30000,
                idleTimeoutMillis: 30000,
                reapIntervalMillis: 10000,
                createRetryIntervalMillis: 200
            }
        }
    },

    // Interlink (Cross-Bot Communication)
    interlink: {
        enabled: process.env.INTERLINK_ENABLED === 'true',
        httpPort: parseIntSafe(process.env.INTERLINK_HTTP_PORT, 3456),
        redisPrefix: process.env.INTERLINK_REDIS_PREFIX || 'apollo:interlink',
        forwardEvents: (process.env.INTERLINK_FORWARD_EVENTS || 'memberJoin,guildBanAdd').split(',').filter(Boolean),
        requestTimeout: parseIntSafe(process.env.INTERLINK_REQUEST_TIMEOUT, 5000),
        maxRetries: parseIntSafe(process.env.INTERLINK_MAX_RETRIES, 3)
    },

    // Instance identity (for leader election)
    podId: process.env.POD_ID || process.env.HOSTNAME || 'default',

    // Queue Configuration
    queue: {
        enabled: process.env.QUEUE_ENABLED === 'true',
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseIntSafe(process.env.REDIS_PORT, 6379),
            password: process.env.REDIS_PASSWORD || undefined
        },
        prefix: process.env.QUEUE_PREFIX || 'apollo',
        stalledInterval: parseIntSafe(process.env.QUEUE_STALLED_INTERVAL, 30000)
    },

    // Operator Agreement (required to start the bot)
    operator: {
        // Must be the literal string 'true' to acknowledge the operator
        // responsibilities in legal/TOS.md. Any other value (including
        // 'yes', '1', 'True') will cause the bot to refuse to start.
        agreed: process.env.OPERATOR_AGREEMENT === 'true',
        // Free-text contact information published to users via the
        // /operator-contact command. Required when OPERATOR_AGREEMENT=true.
        contact: process.env.OPERATOR_CONTACT || ''
    },

    // Sharding Configuration
    shard: {
        enabled: process.env.ENABLE_SHARDING === 'true',
        count: process.env.SHARD_COUNT === 'auto' 
            ? 'auto' 
            : parseIntSafe(process.env.SHARD_COUNT, 1),
        leaderElection: {
            mode: process.env.SHARD_LEADER_MODE || 'hybrid',
            globalTasks: ['commandSync', 'globalScheduler'],
            perShardTasks: ['reminderScheduler', 'pollScheduler', 'spamCleanup', 'automodCleanup']
        },
        // Per-shard resource offsets
        healthPortOffset: 3000,        // shard N uses port 3000 + N
        socketPathBase: '/tmp/apollo', // shard N uses /tmp/apollo-shard-N.sock
        queuePrefixBase: 'apollo',     // shard N uses apollo:shard-N
        redisKeyPrefixBase: 'apollo'   // shard N uses apollo:shard-N:*
    }
};
