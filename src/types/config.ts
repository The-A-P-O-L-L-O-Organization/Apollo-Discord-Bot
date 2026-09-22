// Configuration types for Apollo Discord Bot
// Mirrors src/config/config.js structure with explicit interfaces

import type { ClientOptions } from 'discord.js';
import type { DefaultJobOptions, JobSerializer } from './queue.js';

export interface DiscordConfig {
    token: string;
    clientId: string;
    clientSecret: string | undefined;
    shardCount: number | undefined;
    gateway: ClientOptions['ws'] | undefined;
    intents: number | undefined;
    presence: ClientOptions['presence'] | undefined;
}

export interface DatabaseConfig {
    type: 'sqlite' | 'postgres';
    sqlite?: {
        filename: string;
    };
    postgres?: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        ssl?: boolean;
        pool?: {
            min: number;
            max: number;
        };
    };
}

export interface RedisConfig {
    host: string;
    port: number;
    password: string | undefined;
    username: string | undefined;
    db: number | undefined;
    family: number | undefined;
    tls: boolean | undefined;
    maxRetriesPerRequest: number | undefined;
    retryStrategy: ((times: number) => number | null) | undefined;
    enableReadyCheck: boolean | undefined;
    lazyConnect: boolean | undefined;
}

export interface QueueRedisConfig extends RedisConfig {
    prefix: string | undefined;
}

export interface QueueConfig {
    enabled: boolean;
    redis: QueueRedisConfig;
    prefix: string;
    shard?: ShardConfig;
    name?: string;
    defaultJobOptions?: DefaultJobOptions;
    serializer?: JobSerializer;
}

export interface InterlinkConfig {
    enabled: boolean;
    grpcAddress: string;
    authKey: string;
    publicKey: string;
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    } | undefined;
}

export interface ShardConfig {
    queuePrefixBase: string;
    socketPathBase: string;
    redisKeyPrefixBase: string;
}

export interface OperatorConfig {
    agreed: boolean;
    contact: string;
    requireAgreement: boolean;
    agreementUrl: string;
    agreementVersion: string;
    agreementMessageId: string | undefined;
    agreementChannelId: string | undefined;
}

export interface PluginConfig {
    enabled: string[];
    disabled: string[];
    paths: {
        core: string;
        installed: string;
    };
}

export interface AutomodConfig {
    enabled: boolean;
    bannedWords: string[];
    maxMentions: number;
    maxCapsPercent: number;
    minCapsLength: number;
    minAccountAge: number;
    filterInvites: boolean;
    filterLinks: boolean;
    filterPhishingLinks: boolean;
    raidDetection: boolean;
    spamThreshold: number;
    spamInterval: number;
    spamChannelOverrides: Record<string, unknown>;
    action: string;
    aiModeration: boolean;
    nsfwFilter: boolean;
    useRedisSpamTracking: boolean;
    useRedisRaidDetection: boolean;
    useRedisThreatScore: boolean;
}

export interface WarningThresholds {
    mute: number;
    kick: number;
    ban: number;
}

export interface WarningsConfig {
    thresholds: WarningThresholds;
    muteDuration: number;
    dmOnWarn: boolean;
}

export interface TicketsConfig {
    enabled: boolean;
    categoryId: string | undefined;
    logChannelId: string | undefined;
    supportRoles: string[];
    maxTicketsPerUser: number;
    autoCloseAfterHours: number;
    transcriptEnabled: boolean;
    channelPrefix: string;
    welcomeMessage: string;
}

export interface LevelsConfig {
    enabled: boolean;
    xpPerMessage: number;
    xpCooldownMs: number;
    xpPerMinuteVoice: number;
    cooldown: number;
    minXp: number;
    maxXp: number;
    announceLevelUp: boolean;
    roles: {
        level: number;
        roleId: string;
    }[];
    ignoredChannels: string[];
    ignoredRoles: string[];
    announceChannelId: string | undefined;
}

export interface LoggingConfig {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    pretty: boolean;
    destination: 'stdout' | 'file' | 'both';
    file?: {
        path: string;
        maxSize: string;
        maxFiles: number;
    };
    defaultEvents: Record<string, boolean>;
    availableEvents: string[];
}

export interface RemindersConfig {
    enabled: boolean;
    maxRemindersPerUser: number;
    defaultTimezone: string;
    maxDuration: number;
    checkInterval: number;
}

export interface PollsConfig {
    enabled: boolean;
    maxOptions: number;
    maxDurationHours: number;
    defaultDurationHours: number;
    maxDuration: number;
}

export interface IntegrationsConfig {
    youtube?: {
        apiKey: string;
    };
    twitch?: {
        clientId: string;
        clientSecret: string;
    };
    github?: {
        token: string;
    };
}

export interface ReactionRolesConfig {
    enabled: boolean;
    maxRolesPerMessage: number;
    maxReactionRolesPerGuild: number;
    dmOnRole: boolean;
}

export interface HealthConfig {
    authToken: string | undefined;
}

export interface NsfwConfig {
    useRust: boolean;
    grpcAddr: string;
    threshold: number;
    rustTimeoutMs: number;
}

export interface ApolloConfig {
    discord: DiscordConfig;
    database: DatabaseConfig;
    redis: RedisConfig;
    queue: QueueConfig;
    interlink: InterlinkConfig;
    shard: ShardConfig;
    operator: OperatorConfig;
    plugins: PluginConfig;
    automod: AutomodConfig;
    warnings: WarningsConfig;
    tickets: TicketsConfig;
    levels: LevelsConfig;
    logging: LoggingConfig;
    reminders: RemindersConfig;
    polls: PollsConfig;
    integrations: IntegrationsConfig;
    reactionRoles: ReactionRolesConfig;
    health: HealthConfig;
    nsfw: NsfwConfig;
    threshold: number;
    deleteMessages: boolean;
    warnOnDetection: boolean;
    env: 'development' | 'production' | 'test';
    podId: string;
    activity: {
        name: string;
        type: string;
    };
    welcome: {
        channelName: string;
        message: string;
    };
    moderation: {
        defaultReason: string;
        muteRoleName: string;
        muteDuration: number;
        maxMessagesPerPurge: number;
        purgeCooldown: number;
        logModerationActions: boolean;
        moderationLogChannel: string;
    };
    prefix: string;
    ENCRYPTION_KEY: string;
}

// Type guard for config validation
export function isApolloConfig(obj: unknown): obj is ApolloConfig {
    if (!obj || typeof obj !== 'object') {return false;}
    const config = obj as Record<string, unknown>;
    return (
        typeof config['discord'] === 'object' &&
        typeof config['database'] === 'object' &&
        typeof config['redis'] === 'object' &&
        typeof config['queue'] === 'object' &&
        typeof config['interlink'] === 'object' &&
        typeof config['shard'] === 'object' &&
        typeof config['operator'] === 'object' &&
        typeof config['plugins'] === 'object' &&
        typeof config['automod'] === 'object' &&
        typeof config['warnings'] === 'object' &&
        typeof config['tickets'] === 'object' &&
        typeof config['levels'] === 'object' &&
        typeof config['logging'] === 'object' &&
        typeof config['reminders'] === 'object' &&
        typeof config['polls'] === 'object' &&
        typeof config['integrations'] === 'object' &&
        typeof config['reactionRoles'] === 'object' &&
        typeof config['health'] === 'object' &&
        typeof config['nsfw'] === 'object' &&
        typeof config['threshold'] === 'number' &&
        typeof config['deleteMessages'] === 'boolean' &&
        typeof config['warnOnDetection'] === 'boolean' &&
        typeof config['env'] === 'string'
    );
}