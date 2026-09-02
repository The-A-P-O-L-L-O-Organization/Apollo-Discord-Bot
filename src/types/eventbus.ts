// EventBus types for cross-process pub/sub

import type { Client } from 'discord.js';

export interface EventBusConfig {
    redis: RedisConnectionConfig;
    prefix: string;
    channels: string[];
    maxRetries: number;
    retryDelay: number;
}

export interface RedisConnectionConfig {
    host: string;
    port: number;
    password?: string;
    username?: string;
    db?: number;
    family?: number;
    tls?: boolean;
}

export interface EventBusMessage<T = unknown> {
    event: string;
    payload: T;
    source: EventSource;
    timestamp: number;
    correlationId?: string;
    guildId?: string;
    shardId?: number;
}

export interface EventSource {
    botId: string;
    processId: number;
    type: 'gateway' | 'worker' | 'interlink' | 'cli';
    plugin?: string;
}

export interface EventSubscription {
    event: string;
    handler: EventHandler;
    filter?: EventFilter;
    priority: number;
    once: boolean;
}

export type EventHandler<T = unknown> = (message: EventBusMessage<T>) => Promise<void> | void;

export interface EventFilter {
    guildId?: string;
    shardId?: number;
    sourceType?: EventSource['type'];
    sourcePlugin?: string;
    custom?: (message: EventBusMessage) => boolean;
}

export interface EventBus {
    publish: <T>(event: string, payload: T, options?: PublishOptions) => Promise<void>;
    subscribe: <T>(event: string, handler: EventHandler<T>, options?: SubscribeOptions) => Promise<Subscription>;
    unsubscribe: (subscription: Subscription) => Promise<void>;
    unsubscribeAll: (event?: string) => Promise<void>;
    getSubscriptions: (event?: string) => Promise<Subscription[]>;
    healthCheck: () => Promise<EventBusHealth>;
}

export interface PublishOptions {
    guildId?: string;
    shardId?: number;
    correlationId?: string;
    persistent?: boolean;
    ttl?: number;
}

export interface SubscribeOptions {
    filter?: EventFilter;
    priority?: number;
    once?: boolean;
}

export interface Subscription {
    id: string;
    event: string;
    filter?: EventFilter;
    priority: number;
    once: boolean;
    createdAt: number;
}

export interface EventBusHealth {
    healthy: boolean;
    redisConnected: boolean;
    subscriptions: number;
    publishedCount: number;
    receivedCount: number;
    errorCount: number;
    latency: number;
}

// Core bot events
export interface BotEvents {
    // Gateway events
    'bot:ready': { client: Client; shardId: number };
    'bot:shardReady': { shardId: number; guilds: number };
    'bot:shardDisconnect': { shardId: number; reason: string };
    'bot:shardReconnecting': { shardId: number; attempt: number };
    'bot:shardResume': { shardId: number; replayed: number };

    // Worker events
    'worker:started': { workerId: string; queues: string[] };
    'worker:stopped': { workerId: string; reason: string };
    'worker:jobStarted': { workerId: string; jobId: string; jobName: string };
    'worker:jobCompleted': { workerId: string; jobId: string; jobName: string; duration: number };
    'worker:jobFailed': { workerId: string; jobId: string; jobName: string; error: string };

    // Command events
    'command:received': { interaction: SerializedInteraction; shardId: number };
    'command:processed': { interaction: SerializedInteraction; result: CommandResult; duration: number };
    'command:failed': { interaction: SerializedInteraction; error: string; duration: number };

    // Guild events
    'guild:join': { guild: SerializedGuild; shardId: number };
    'guild:leave': { guildId: string; shardId: number };
    'guild:update': { oldGuild: SerializedGuild; newGuild: SerializedGuild; shardId: number };

    // Moderation events
    'moderation:action': ModerationActionEvent;
    'moderation:violation': ModerationViolationEvent;

    // Analytics events
    'analytics:message': AnalyticsMessageEvent;
    'analytics:violation': AnalyticsViolationEvent;
    'analytics:flushed': { guildId: string; records: number };

    // Plugin events
    'plugin:loaded': { pluginName: string; capabilities: string[] };
    'plugin:enabled': { pluginName: string };
    'plugin:disabled': { pluginName: string };
    'plugin:error': { pluginName: string; error: string; phase: 'load' | 'enable' | 'disable' | 'unload' };

    // Interlink events
    'interlink:connected': { botId: string };
    'interlink:disconnected': { botId: string; reason: string };
    'interlink:serviceRegistered': { botId: string; service: string };
    'interlink:rpcCall': { from: string; to: string; method: string; duration: number };

    // System events
    'system:healthCheck': SystemHealthEvent;
    'system:configChanged': { key: string; oldValue: unknown; newValue: unknown };
    'system:error': { error: string; context: Record<string, unknown>; fatal: boolean };
}

export interface SerializedInteraction {
    id: string;
    type: number;
    guildId: string | null;
    channelId: string;
    user: {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        bot: boolean;
    };
    member: {
        user: {
            id: string;
            username: string;
            discriminator: string;
            avatar: string | null;
            bot: boolean;
        };
        roles: string[];
        joinedAt: string | null;
        premiumSince: string | null;
        permissions: string;
        pending: boolean;
    } | null;
    data: {
        id: string;
        name: string;
        type: number;
        options: Array<{
            name: string;
            type: number;
            value: unknown;
            options?: Array<unknown>;
            focused?: boolean;
        }> | null;
    } | null;
    token: string;
    version: number;
    appPermissions: string | null;
    locale: string;
    guildLocale: string | null;
    entitlements: unknown[];
}

export interface SerializedGuild {
    id: string;
    name: string;
    icon: string | null;
    ownerId: string;
    memberCount: number;
    features: string[];
    verified: boolean;
    nsfwLevel: number;
    preferredLocale: string;
}

export interface CommandResult {
    success: boolean;
    response?: {
        type: number;
        data?: Record<string, unknown>;
    };
    error?: string;
    ephemeral?: boolean;
}

export interface ModerationActionEvent {
    guildId: string;
    userId: string;
    moderatorId: string;
    type: 'ban' | 'kick' | 'timeout' | 'warn' | 'mute' | 'unmute' | 'unban';
    reason: string;
    duration?: number;
    deleteMessageSeconds?: number;
    timestamp: number;
}

export interface ModerationViolationEvent {
    guildId: string;
    userId: string;
    channelId: string;
    type: string;
    reason: string;
    messageContent?: string;
    actionTaken: string;
    timestamp: number;
}

export interface AnalyticsMessageEvent {
    guildId: string;
    channelId: string;
    userId: string;
    messageLength: number;
    hasAttachments: boolean;
    hasEmbeds: boolean;
    timestamp: number;
}

export interface AnalyticsViolationEvent {
    guildId: string;
    userId: string;
    type: string;
    action: string;
    details?: Record<string, unknown>;
    timestamp: number;
}

export interface SystemHealthEvent {
    timestamp: number;
    uptime: number;
    memory: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
    };
    cpu: {
        user: number;
        system: number;
    };
    eventLoop: {
        latency: number;
    };
    shards: Array<{
        id: number;
        status: string;
        latency: number;
        guilds: number;
    }>;
    queues: Record<string, {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    }>;
}