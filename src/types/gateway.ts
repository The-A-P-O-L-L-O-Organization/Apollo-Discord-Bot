// Gateway types for multi-shard Discord bot

import type {
    ClientOptions,
    GatewayDispatchEvents,
    GatewayIntentBits,
    ClientUser,
    Guild,
    Channel,
    User,
    Team,
    REST,
    Routes,
    APIUser,
    APIGuild,
    APIChannel,
    Webhook
} from 'discord.js';

export interface GatewayConfig {
    shardCount: number;
    shardList?: number[];
    totalShards?: number;
    token: string;
    intents: number | GatewayIntentBits[];
    presence?: ClientOptions['presence'];
    ws?: ClientOptions['ws'];
    rest?: ClientOptions['rest'];
    makeCache?: ClientOptions['makeCache'];
    sweepers?: ClientOptions['sweepers'];
    allowedMentions?: ClientOptions['allowedMentions'];
    failIfNotExists?: ClientOptions['failIfNotExists'];
}

export interface ShardConfig {
    id: number;
    status: ShardStatus;
    guilds: number;
    latency: number;
    memoryUsage: number;
    cpuUsage: number;
    lastHeartbeat: number;
    lastEvent: number;
    eventsProcessed: number;
    eventsFailed: number;
    reconnectAttempts: number;
    resumeGatewayUrl?: string;
    sessionId?: string;
    sequence?: number;
}

export type ShardStatus =
    | 'idle'
    | 'connecting'
    | 'identifying'
    | 'ready'
    | 'resuming'
    | 'reconnecting'
    | 'disconnected'
    | 'destroyed'
    | 'error';

export interface ShardManagerEvents {
    shardCreate: [shard: ShardInfo];
    shardReady: [shard: ShardInfo];
    shardDisconnect: [event: ShardDisconnectEvent];
    shardReconnecting: [shard: ShardInfo, attempt: number];
    shardResume: [shard: ShardInfo, replayed: number];
    shardError: [error: Error, shardId: number];
    invalidSession: [shardId: number, resumable: boolean];
}

export interface ShardInfo {
    id: number;
    status: ShardStatus;
    guilds: number;
    latency: number;
    memoryUsage: number;
    cpuUsage: number;
    lastHeartbeat: number;
    lastEvent: number;
    eventsProcessed: number;
    eventsFailed: number;
    reconnectAttempts: number;
}

export interface ShardDisconnectEvent {
    shardId: number;
    code: number;
    reason: string;
    wasClean: boolean;
    reconnect: boolean;
}

export interface GatewayEvents {
    ready: [client: GatewayClient];
    shardReady: [shardId: number, guilds: number];
    shardDisconnect: [shardId: number, reason: string];
    shardReconnecting: [shardId: number, attempt: number];
    shardResume: [shardId: number, replayed: number];
    shardError: [error: Error, shardId: number];
    invalidSession: [shardId: number, resumable: boolean];
    allReady: [shards: ShardInfo[]];
}

export interface GatewayClient {
    shard: ShardManager;
    user: ClientUser | null;
    guilds: GuildManager;
    channels: ChannelManager;
    users: UserManager;
    voice: VoiceManager;
    ws: WebSocketManager;
    rest: RESTManager;
    application: ApplicationManager;

    on<K extends keyof GatewayEvents>(event: K, listener: (...args: GatewayEvents[K]) => void): this;
    once<K extends keyof GatewayEvents>(event: K, listener: (...args: GatewayEvents[K]) => void): this;
    emit<K extends keyof GatewayEvents>(event: K, ...args: GatewayEvents[K]): boolean;
    off<K extends keyof GatewayEvents>(event: K, listener: (...args: GatewayEvents[K]) => void): this;
}

export interface ShardManager {
    readonly id: number;
    readonly status: ShardStatus;
    readonly info: ShardInfo;
    spawn: () => Promise<void>;
    respawn: () => Promise<void>;
    destroy: () => Promise<void>;
    send: (payload: unknown) => Promise<void>;
    eval: (script: string) => Promise<unknown>;
    broadcastEval: (script: string) => Promise<unknown[]>;
    fetchClientValues: (prop: string) => Promise<unknown[]>;
    broadcast: <T>(type: string, payload: T) => Promise<void>;
}

export interface Shard {
    id: number;
    status: ShardStatus;
    manager: ShardManager;
    send: (payload: unknown) => Promise<void>;
    eval: (script: string) => Promise<unknown>;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    once: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface BroadcastPayload {
    type: string;
    payload: unknown;
    shardId?: number;
}

export interface EvalOptions {
    script: string;
    context?: Record<string, unknown>;
    timeout?: number;
}

// Manager interfaces
export interface GuildManager {
    cache: Map<string, Guild>;
    fetch: (id: string, cache?: boolean) => Promise<Guild | null>;
    create: (options: GuildCreateOptions) => Promise<Guild>;
    leave: (id: string) => Promise<void>;
}

export interface GuildCreateOptions {
    name: string;
    icon?: Buffer;
    verificationLevel?: number;
    defaultMessageNotifications?: number;
    explicitContentFilter?: number;
    roles?: { name: string; color?: number; permissions?: bigint }[];
    channels?: { name: string; type: number; parent?: string }[];
    afkChannelId?: string;
    afkTimeout?: number;
    systemChannelId?: string;
    systemChannelFlags?: number;
}

export interface ChannelManager {
    cache: Map<string, Channel>;
    fetch: (id: string, cache?: boolean, force?: boolean) => Promise<Channel | null>;
    create: (guildId: string, options: ChannelCreateOptions) => Promise<Channel>;
    delete: (id: string, reason?: string) => Promise<void>;
}

export interface ChannelCreateOptions {
    name: string;
    type: number;
    parent?: string;
    topic?: string;
    nsfw?: boolean;
    bitrate?: number;
    userLimit?: number;
    rateLimitPerUser?: number;
    position?: number;
    permissionOverwrites?: {
        id: string;
        type: number;
        allow?: bigint;
        deny?: bigint;
    }[];
}

export interface UserManager {
    cache: Map<string, User>;
    fetch: (id: string, cache?: boolean, force?: boolean) => Promise<User | null>;
    fetchApplication: () => Promise<APIUser>;
}

export interface VoiceManager {
    connections: Map<string, VoiceConnection>;
    join: (channelId: string, options?: VoiceJoinOptions) => Promise<VoiceConnection>;
    leave: (guildId: string) => Promise<void>;
}

export interface VoiceConnection {
    guildId: string;
    channelId: string;
    status: 'connecting' | 'ready' | 'disconnected' | 'destroyed';
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    destroy: () => void;
}

export interface VoiceJoinOptions {
    selfDeaf?: boolean;
    selfMute?: boolean;
    selfVideo?: boolean;
}

export interface WebSocketManager {
    shards: Map<number, WebSocketShard>;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    getShard: (id: number) => WebSocketShard | undefined;
}

export interface WebSocketShard {
    id: number;
    status: ShardStatus;
    latency: number;
    send: (payload: unknown) => boolean;
}

export interface RESTManager {
    rest: REST;
    post: <T>(route: string, body?: unknown, options?: { auth?: boolean }) => Promise<T>;
    get: <T>(route: string, options?: { auth?: boolean }) => Promise<T>;
    patch: <T>(route: string, body?: unknown, options?: { auth?: boolean }) => Promise<T>;
    put: <T>(route: string, body?: unknown, options?: { auth?: boolean }) => Promise<T>;
    delete: <T>(route: string, options?: { auth?: boolean }) => Promise<T>;
}

export interface ApplicationManager {
    id: string;
    owner: User | Team;
    name: string;
    description: string;
    icon: string | null;
    commands: ApplicationCommandManager;
    fetch: () => Promise<APIUser>;
}

export interface ApplicationCommandManager {
    cache: Map<string, ApplicationCommand>;
    fetch: (guildId?: string) => Promise<ApplicationCommand[]>;
    create: (data: ApplicationCommandData, guildId?: string) => Promise<ApplicationCommand>;
    edit: (commandId: string, data: Partial<ApplicationCommandData>, guildId?: string) => Promise<ApplicationCommand>;
    delete: (commandId: string, guildId?: string) => Promise<void>;
    set: (commands: ApplicationCommandData[], guildId?: string) => Promise<ApplicationCommand[]>;
}

export interface ApplicationCommand {
    id: string;
    applicationId: string;
    name: string;
    description: string;
    type: number;
    options?: ApplicationCommandOption[];
    defaultMemberPermissions?: bigint | null;
    dmPermission?: boolean;
    contexts?: number[];
    integrationTypes?: number[];
}

export interface ApplicationCommandOption {
    name: string;
    description: string;
    type: number;
    required?: boolean;
    choices?: ApplicationCommandChoice[];
    autocomplete?: boolean;
    minValue?: number;
    maxValue?: number;
    minLength?: number;
    maxLength?: number;
    channelTypes?: number[];
    options?: ApplicationCommandOption[];
}

export interface ApplicationCommandChoice {
    name: string;
    nameLocalizations?: Record<string, string>;
    value: string | number;
}

export interface ApplicationCommandData {
    name: string;
    description: string;
    type?: number;
    options?: ApplicationCommandOption[];
    defaultMemberPermissions?: string | number | null;
    dmPermission?: boolean;
    contexts?: number[];
    integrationTypes?: number[];
}

export interface LeaderElectionConfig {
    enabled: boolean;
    lockKey: string;
    lockTtl: number;
    retryInterval: number;
    retryJitter: number;
}

export interface LeaderInfo {
    id: string;
    electedAt: number;
    shardCount: number;
    shardIds: number[];
    metadata?: Record<string, unknown>;
}

export interface GatewayRPC {
    call: <T>(target: string, method: string, params?: unknown) => Promise<T>;
    notify: (target: string, method: string, params?: unknown) => Promise<void>;
    onMessage: (handler: (message: RPCMessage) => void) => void;
}

export interface RPCMessage {
    id: string;
    target: string;
    method: string;
    params?: unknown;
    timestamp: number;
}