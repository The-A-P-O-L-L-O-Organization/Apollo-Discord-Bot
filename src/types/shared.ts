// Shared types to avoid duplication across type modules
// This module has NO dependencies on other local type modules to avoid circular imports

import type { Client, Interaction, AutocompleteInteraction, CommandInteraction, ButtonInteraction, SelectMenuInteraction, ContextMenuCommandInteraction } from 'discord.js';

// ============================================
// Discord.js common types (re-exported for convenience)
// ============================================
export type {
    Client,
    Interaction,
    AutocompleteInteraction,
    CommandInteraction,
    ButtonInteraction,
    SelectMenuInteraction,
    ContextMenuCommandInteraction
};

// ============================================
// Serialized Interaction (used by queue, RPC, eventbus)
// ============================================
export interface SerializedUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot: boolean;
    system: boolean;
}

export interface SerializedMember {
    user: SerializedUser;
    roles: string[];
    joinedAt: string | null;
    premiumSince: string | null;
    permissions: string;
    pending: boolean;
}

export interface SerializedCommandOption {
    name: string;
    type: number;
    value: unknown;
    options?: SerializedCommandOption[];
    focused?: boolean;
}

export interface SerializedCommandData {
    id: string;
    name: string;
    type: number;
    options: SerializedCommandOption[];
}

export interface SerializedInteraction {
    id: string;
    type: number;
    guildId: string | null;
    channelId: string;
    user: SerializedUser;
    member: SerializedMember | null;
    data: SerializedCommandData | null;
    token: string;
    version: number;
    appPermissions: string | null;
    locale: string;
    guildLocale: string | null;
    entitlements: unknown[];
}

// ============================================
// Command Data types (shared between plugin.ts and discord.ts)
// ============================================
export interface CommandData {
    name: string;
    description: string;
    options?: CommandOption[];
    defaultMemberPermissions?: string | number;
    dmPermission?: boolean;
    contexts?: number[];
    integrationTypes?: number[];
}

export interface CommandOption {
    name: string;
    description: string;
    type: number;
    required?: boolean;
    choices?: CommandChoice[];
    autocomplete?: boolean;
    minValue?: number;
    maxValue?: number;
    minLength?: number;
    maxLength?: number;
    channelTypes?: number[];
}

export interface CommandChoice {
    name: string;
    value: string | number;
}

// ============================================
// Plugin Logger
// ============================================
export interface PluginLogger {
    trace: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    fatal: (msg: string, meta?: Record<string, unknown>) => void;
    child: (meta: Record<string, unknown>) => PluginLogger;
}

// ============================================
// Base Plugin types
// ============================================
export type PluginCapability =
    | 'commands'
    | 'events'
    | 'cli'
    | 'rpc'
    | 'database'
    | 'queue'
    | 'schedule'
    | 'interlink'
    | 'web'
    | 'voice';

export interface BasePlugin {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly capabilities: PluginCapability[];
    onLoad?: (context: PluginContext) => Promise<void> | void;
    onEnable?: () => Promise<void> | void;
    onDisable?: () => Promise<void> | void;
    onUnload?: () => Promise<void> | void;
}

export interface PluginManifest {
    name: string;
    version: string;
    description: string;
    author: string;
    license?: string;
    main: string;
    capabilities: PluginCapability[];
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

// ============================================
// Plugin Command/Event/CLI types
// ============================================
export interface PluginCommand {
    data: CommandData;
    execute: (interaction: Interaction, context: PluginContext) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, context: PluginContext) => Promise<void>;
}

export interface PluginEvent {
    name: string;
    once: boolean;
    execute: (...args: unknown[]) => Promise<void>;
}

export interface CLICommand {
    name: string;
    description: string;
    options: CLICommandOption[];
    execute: (args: ParsedArgs, context: PluginContext) => Promise<void>;
}

export interface CLICommandOption {
    name: string;
    alias?: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    required?: boolean;
    default?: unknown;
}

export interface ParsedArgs {
    [key: string]: unknown;
    _: string[];
}

// Command module type for dynamic loading
export interface CommandModule {
    name: string;
    description?: string;
    pluginId: string;
    data?: import('discord.js').SlashCommandBuilder | import('discord.js').RESTPostAPIChatInputApplicationCommandsJSONBody;
    type?: number;
    options?: unknown[];
    dmPermission?: boolean;
    canQueue?: boolean;
    execute: (interaction: import('discord.js').ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: import('discord.js').AutocompleteInteraction) => Promise<void>;
}

// Event handler module type for dynamic loading
export interface EventHandlerModule {
    name: string;
    once?: boolean;
    execute: (...args: unknown[]) => Promise<void>;
    handler?: (...args: unknown[]) => void;
}

export type RPCHandler = (params: unknown, context: RPCContext) => Promise<unknown>;

export interface RPCContext {
    clientId: string;
    pluginName: string;
    timestamp: number;
}

// Forward declarations for PluginContext (full definition below)
export interface PluginDatabase {
    getGuildData: <T>(guildId: string, key: string, defaultValue?: T) => Promise<T | undefined>;
    setGuildData: <T>(guildId: string, key: string, value: T) => Promise<void>;
    getUserData: <T>(userId: string, key: string, defaultValue?: T) => Promise<T | undefined>;
    setUserData: <T>(userId: string, key: string, value: T) => Promise<void>;
    getAllGuildData: <T>(key: string) => Promise<Map<string, T>>;
    getAllUserData: <T>(key: string) => Promise<Map<string, T>>;
}

export interface PluginQueue {
    add: <T>(jobName: string, data: T, options?: JobOptions) => Promise<Job<T>>;
    getQueue: (name: string) => Promise<QueueInstance | null>;
}

export interface JobOptions {
    attempts?: number;
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
    delay?: number;
    priority?: number;
    removeOnComplete?: boolean | { age: number; count: number };
    removeOnFail?: boolean | { age: number; count: number };
    repeat?: { pattern: string } | { every: number };
}

export interface Job<T = unknown> {
    id: string;
    name: string;
    data: T;
    opts: JobOptions;
    progress: number;
    timestamp: number;
    attemptsMade: number;
    failedReason?: string;
}

export interface QueueInstance {
    name: string;
    add: <T>(jobName: string, data: T, options?: JobOptions) => Promise<Job<T>>;
    close: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    getJobs: (types: JobType[]) => Promise<Job[]>;
    getJobCounts: () => Promise<Record<string, number>>;
}

export type JobType = 'wait' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';

export interface PluginRPC {
    register: (namespace: string, handlers: Record<string, RPCHandler>) => void;
    unregister: (namespace: string) => void;
    call: <T>(target: string, method: string, params?: unknown) => Promise<T>;
}

export interface PluginScheduler {
    schedule: (name: string, cron: string, handler: () => Promise<void>) => Promise<void>;
    unschedule: (name: string) => Promise<void>;
    getScheduled: () => Promise<string[]>;
}

export interface PluginInterlink {
    registerService: (name: string, handler: InterlinkHandler) => void;
    callService: <T>(service: string, method: string, params?: unknown) => Promise<T>;
    getServices: () => Promise<string[]>;
}

export type InterlinkHandler = (method: string, params: unknown, context: InterlinkContext) => Promise<unknown>;

export interface InterlinkContext {
    sourceBotId: string;
    sourcePlugin?: string;
    timestamp: number;
}

// ============================================
// Plugin Context (single source of truth)
// Uses forward-declared interfaces above
// ============================================
export interface PluginContext {
    client: Client;
    config: Readonly<Record<string, unknown>>;
    logger: PluginLogger;
    db: PluginDatabase;
    queue: PluginQueue;
    rpc: PluginRPC;
    scheduler: PluginScheduler;
    interlink: PluginInterlink;
}

// ============================================
// Service Interfaces (for ApolloClientExtensions)
// ============================================
export interface PluginManager {
    loadPlugin: (name: string, path: string) => Promise<void>;
    enablePlugin: (name: string) => Promise<void>;
    disablePlugin: (name: string) => Promise<void>;
    unloadPlugin: (name: string) => Promise<void>;
    getPlugin: (name: string) => PluginInstance | undefined;
    getAllPlugins: () => Map<string, PluginInstance>;
    reloadPlugin: (name: string) => Promise<void>;
}

export interface PluginInstance {
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    capabilities: string[];
    commands: Map<string, PluginCommand>;
    events: Map<string, PluginEvent>;
    cliCommands: Map<string, CLICommand>;
    rpcNamespace?: string;
    rpcHandlers?: Map<string, RPCHandler>;
}

export interface AnalyticsInstance {
    trackMessage: (guildId: string, channelId: string, userId: string, meta?: Record<string, unknown>) => Promise<void>;
    trackViolation: (guildId: string, userId: string, type: string, action: string, details?: Record<string, unknown>) => Promise<void>;
    flush: (guildId?: string, force?: boolean) => Promise<void>;
    getStats: (guildId: string) => Promise<AnalyticsStats>;
}

export interface AnalyticsStats {
    messagesTracked: number;
    violationsTracked: number;
    lastFlush: number;
    pendingRecords: number;
}

export interface MetricsInstance {
    increment: (name: string, labels?: Record<string, string>, value?: number) => void;
    decrement: (name: string, labels?: Record<string, string>, value?: number) => void;
    gauge: (name: string, value: number, labels?: Record<string, string>) => void;
    histogram: (name: string, value: number, labels?: Record<string, string>) => void;
    summary: (name: string, value: number, labels?: Record<string, string>) => void;
}

export interface HealthCheckInstance {
    check: () => Promise<HealthCheckResult>;
    registerCheck: (name: string, check: () => Promise<ComponentHealth>) => void;
    unregisterCheck: (name: string) => void;
}

export interface HealthCheckResult {
    healthy: boolean;
    timestamp: number;
    uptime: number;
    checks: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
    healthy: boolean;
    latency?: number;
    message?: string;
    details?: Record<string, unknown>;
}

// ============================================
// CLI Context
// ============================================
export interface CLIContext {
    config: Readonly<Record<string, unknown>>;
    logger: PluginLogger;
    db: PluginDatabase;
    queue: PluginQueue;
    rpc: PluginRPC;
    scheduler: PluginScheduler;
    interlink: PluginInterlink;
}

// ============================================
// Apollo Config (minimal for cross-references)
// ============================================
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
    threshold: number;
    deleteMessages: boolean;
    warnOnDetection: boolean;
    env: 'development' | 'production' | 'test';
    activity: { name: string; type: string };
    welcome: { channelName: string; message: string };
    moderation: { defaultReason: string; muteRoleName: string; muteDuration: number; maxMessagesPerPurge: number; purgeCooldown: number; logModerationActions: boolean; moderationLogChannel: string };
    prefix: string;
    ENCRYPTION_KEY: string;
}

// Minimal config sub-interfaces for ApolloConfig
export interface DiscordConfig {
    token: string;
    clientId: string;
    clientSecret: string | undefined;
    shardCount: number | undefined;
    gateway: unknown;
    intents: number | undefined;
    presence: unknown;
}

export interface DatabaseConfig {
    type: 'sqlite' | 'postgres';
    sqlite?: { filename: string };
    postgres?: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean; pool?: { min: number; max: number } };
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
    shard?: { queuePrefixBase: string };
}

export interface InterlinkConfig {
    enabled: boolean;
    host: string;
    port: number;
    authToken: string | undefined;
    rateLimit: { windowMs: number; maxRequests: number } | undefined;
}

export interface ShardConfig {
    queuePrefixBase: string;
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
    paths: { core: string; installed: string };
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

export interface WarningThresholds { mute: number; kick: number; ban: number; }

export interface WarningsConfig { thresholds: WarningThresholds; muteDuration: number; dmOnWarn: boolean; }

export interface TicketsConfig {
    enabled: boolean;
    categoryId: string | undefined;
    logChannelId: string | undefined;
    supportRoles: string[];
    maxTicketsPerUser: number;
    autoCloseAfterHours: number;
    transcriptEnabled: boolean;
}

export interface LevelsConfig {
    enabled: boolean;
    xpPerMessage: number;
    xpCooldownMs: number;
    xpPerMinuteVoice: number;
    roles: { level: number; roleId: string }[];
    ignoredChannels: string[];
    ignoredRoles: string[];
    announceChannelId: string | undefined;
}

export interface LoggingConfig {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    pretty: boolean;
    destination: 'stdout' | 'file' | 'both';
    file?: { path: string; maxSize: string; maxFiles: number };
}

export interface RemindersConfig { enabled: boolean; maxRemindersPerUser: number; defaultTimezone: string; }

export interface PollsConfig { enabled: boolean; maxOptions: number; maxDurationHours: number; defaultDurationHours: number; }

export interface IntegrationsConfig {
    youtube?: { apiKey: string };
    twitch?: { clientId: string; clientSecret: string };
    github?: { token: string };
}

export interface ReactionRolesConfig { enabled: boolean; maxRolesPerMessage: number; maxReactionRolesPerGuild: number; }

// ============================================
// Apollo Client Extensions
// ============================================
export interface ApolloClientExtensions {
    config: ApolloConfig;
    pluginManager: PluginManager;
    queueManager: QueueManager;
    eventBus: EventBus;
    db: DatabaseAdapter;
    analytics: AnalyticsInstance;
    metrics: MetricsInstance;
    health: HealthCheckInstance;
}

// ============================================
// Forward declarations for external types
// ============================================
export interface QueueManager {
    getQueue: <T extends JobName>(name: T) => Queue<QueueJobDataMap[T]> | null;
    createQueue: <T extends JobName>(name: T, config?: Partial<QueueConfig>) => Promise<Queue<QueueJobDataMap[T]>>;
    closeQueue: (name: string) => Promise<void>;
    closeAll: () => Promise<void>;
    getMetrics: (name: string) => Promise<QueueMetrics>;
    healthCheck: (name: string) => Promise<QueueHealthCheck>;
    pauseQueue: (name: string) => Promise<void>;
    resumeQueue: (name: string) => Promise<void>;
    addJob: <T extends JobName>(queueName: T, jobName: T, data: QueueJobDataMap[T], options?: JobsOptions) => Promise<Job<QueueJobDataMap[T]>>;
    getJob: <T extends JobName>(queueName: T, jobId: string) => Promise<Job<QueueJobDataMap[T]> | undefined>;
    removeJob: (queueName: string, jobId: string) => Promise<void>;
    retryJob: (queueName: string, jobId: string) => Promise<void>;
    promoteJob: (queueName: string, jobId: string) => Promise<void>;
}

export interface QueueConfig {
    name: string;
    prefix: string;
    redis: QueueRedisConfig;
    defaultJobOptions: DefaultJobOptions;
    serializer: JobSerializer;
}

export interface RedisConnectionConfig {
    host: string;
    port: number;
    password?: string;
    username?: string;
    db?: number;
    family?: number;
    tls?: boolean;
    maxRetriesPerRequest?: number;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
}

export interface DefaultJobOptions {
    attempts: number;
    backoff: BackoffOptions;
    removeOnComplete: RemoveOptions;
    removeOnFail: RemoveOptions;
    priority?: number;
    delay?: number;
    timeout?: number;
    stackTraceLimit?: number;
}

export interface BackoffOptions { type: 'exponential' | 'fixed'; delay: number; }
export interface RemoveOptions { age: number; count: number; }

export interface JobSerializer {
    serialize: (data: unknown) => Buffer | string;
    deserialize: (data: Buffer | string) => unknown;
}

export interface QueueMetrics { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: number; total: number; }

export interface QueueHealthCheck { healthy: boolean; redisConnected: boolean; queuePaused: boolean; metrics: QueueMetrics; oldestJobAge?: number; workersOnline: number; }

export type JobName =
    | 'process-command'
    | 'heavy-operation'
    | 'scheduled-task'
    | 'nsfw:analyze'
    | 'analytics:flush'
    | 'moderation:action'
    | 'webhook:deliver'
    | 'email:send'
    | 'backup:create'
    | 'cleanup:expired';

export interface QueueJobDataMap {
    'process-command': ProcessCommandJobData;
    'heavy-operation': HeavyOperationJobData;
    'scheduled-task': ScheduledTaskJobData;
    'nsfw:analyze': NSFWAnalyzeJobData;
    'analytics:flush': AnalyticsFlushJobData;
    'moderation:action': ModerationActionJobData;
    'webhook:deliver': WebhookDeliverJobData;
    'email:send': EmailSendJobData;
    'backup:create': BackupCreateJobData;
    'cleanup:expired': CleanupExpiredJobData;
}

export interface ProcessCommandJobData { interaction: SerializedInteraction; timestamp: number; }
export interface HeavyOperationJobData { operation: string; data: unknown; priority?: number; timeout?: number; }
export interface ScheduledTaskJobData { taskName: string; cron?: string; interval?: number; data?: unknown; }
export interface NSFWAnalyzeJobData { imageUrl: string; guildId: string; threshold: number; attachmentName?: string; attachmentId?: string; }
export interface AnalyticsFlushJobData { guildId?: string; force?: boolean; }
export interface ModerationActionJobData { guildId: string; userId: string; moderatorId: string; type: 'ban' | 'kick' | 'timeout' | 'warn' | 'mute' | 'unmute' | 'unban'; reason: string; duration?: number; deleteMessageSeconds?: number; }
export interface WebhookDeliverJobData { webhookId: string; webhookToken: string; payload: Record<string, unknown>; retries?: number; }
export interface EmailSendJobData { to: string; subject: string; html: string; text?: string; attachments?: { filename: string; content: Buffer | string; contentType?: string }[]; }
export interface BackupCreateJobData { type: 'full' | 'incremental'; includeData: boolean; destination: string; }
export interface CleanupExpiredJobData { type: 'reminders' | 'polls' | 'tickets' | 'warnings' | 'analytics'; olderThan: number; dryRun?: boolean; }

export interface JobsOptions {}
export interface Queue<T> {}
export interface EventBus {}
export interface PublishOptions {}
export interface SubscribeOptions {}
export interface Subscription {}
export interface EventBusHealth {}
export interface EventHandler<T> {}
export interface DatabaseAdapter {}