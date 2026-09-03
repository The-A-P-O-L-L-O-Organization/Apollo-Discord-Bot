// Plugin system types

import type { Client, Guild, Channel, User, GuildMember, Message, Interaction } from 'discord.js';
import type { QueueManager, JobName, QueueJobDataMap } from './queue.js';
import type { EventBus, PublishOptions, SubscribeOptions, Subscription, EventBusHealth, EventHandler } from './eventbus.js';
import type { DatabaseAdapter } from './database.js';
import type {
    PluginLogger,
    PluginCommand,
    PluginEvent,
    CLICommand,
    CLICommandOption,
    ParsedArgs,
    RPCHandler,
    BasePlugin,
    PluginContext,
    CommandData,
    CommandOption,
    CommandChoice
} from './shared.js';

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

export interface PluginConfig {
    name: string;
    enabled: boolean;
    config?: Record<string, unknown>;
}

// Re-export shared types
export type {
    PluginLogger,
    PluginCommand,
    PluginEvent,
    CLICommand,
    CLICommandOption,
    ParsedArgs,
    RPCHandler,
    BasePlugin,
    PluginContext,
    CommandData,
    CommandOption,
    CommandChoice,
    CommandModule,
    EventHandlerModule
} from './shared.js';

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

export interface RPCContext {
    clientId: string;
    pluginName: string;
    timestamp: number;
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

// Re-export Plugin types that extend BasePlugin
export interface CommandPlugin extends BasePlugin {
    capabilities: ('commands' | PluginCapability)[];
    commands: Map<string, PluginCommand>;
}

export interface EventPlugin extends BasePlugin {
    capabilities: ('events' | PluginCapability)[];
    events: Map<string, PluginEvent>;
}

export interface CLIPlugin extends BasePlugin {
    capabilities: ('cli' | PluginCapability)[];
    commands: Map<string, CLICommand>;
}

export interface RPCPlugin extends BasePlugin {
    capabilities: ('rpc' | PluginCapability)[];
    rpcNamespace: string;
    rpcHandlers: Map<string, RPCHandler>;
}