// RPC (Remote Procedure Call) types for inter-process communication

import type { Client } from 'discord.js';

export interface RPCMessage {
    id: string;
    namespace: string;
    method: string;
    params: unknown;
    timestamp: number;
    correlationId?: string;
}

export interface RPCResponse<T = unknown> {
    id: string;
    result?: T;
    error?: RPCError;
    timestamp: number;
}

export interface RPCError {
    code: number;
    message: string;
    data?: unknown;
}

export type RPCHandler<TParams = unknown, TResult = unknown> = (
    params: TParams,
    context: RPCContext
) => Promise<TResult> | TResult;

export interface RPCContext {
    clientId: string;
    pluginName?: string;
    userId?: string;
    guildId?: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

export interface RPCNamespace {
    name: string;
    version: string;
    handlers: Map<string, RPCHandler>;
    middleware?: RPCMiddleware[];
}

export type RPCMiddleware = (
    message: RPCMessage,
    next: () => Promise<RPCResponse>
) => Promise<RPCResponse>;

export interface RPCClient {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    call: <T>(namespace: string, method: string, params?: unknown, timeout?: number) => Promise<T>;
    notify: (namespace: string, method: string, params?: unknown) => Promise<void>;
    onResponse: (handler: (response: RPCResponse) => void) => void;
    onError: (handler: (error: Error) => void) => void;
    onClose: (handler: () => void) => void;
}

export interface RPCServer {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    registerNamespace: (namespace: RPCNamespace) => void;
    unregisterNamespace: (name: string) => void;
    onConnection: (handler: (client: RPCClientInfo) => void) => void;
    onDisconnection: (handler: (client: RPCClientInfo) => void) => void;
}

export interface RPCClientInfo {
    id: string;
    remoteAddress: string;
    connectedAt: number;
    pluginName?: string;
    capabilities: string[];
}

// Worker RPC types
export interface WorkerRPCMessage extends RPCMessage {
    workerId: string;
    shardId?: number;
}

export interface WorkerRPCResponse<T = unknown> extends RPCResponse<T> {
    workerId: string;
}

export interface WorkerJobData {
    jobId: string;
    jobName: string;
    data: unknown;
    attemptsMade: number;
    timestamp: number;
}

export interface WorkerResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    duration: number;
}

// Gateway RPC types
export interface GatewayRPCMessage extends RPCMessage {
    type: 'command' | 'event' | 'presence' | 'voice' | 'shard';
}

export interface ShardInfo {
    id: number;
    status: 'connecting' | 'ready' | 'disconnected' | 'reconnecting' | 'resuming';
    guilds: number;
    latency: number;
    memoryUsage: number;
    cpuUsage: number;
    lastHeartbeat: number;
}

export interface GatewayCommandPayload {
    shardId?: number;
    type: 'eval' | 'restart' | 'status' | 'broadcast' | 'guildAction';
    payload: unknown;
}

// Interlink RPC types
export interface InterlinkRPCMessage extends RPCMessage {
    sourceBotId: string;
    targetBotId?: string;
    broadcast?: boolean;
}

export interface InterlinkService {
    name: string;
    version: string;
    methods: Map<string, InterlinkMethod>;
}

export interface InterlinkMethod {
    name: string;
    description: string;
    paramsSchema?: Record<string, unknown>; // JSON Schema
    resultSchema?: Record<string, unknown>;
    handler: (params: unknown, context: InterlinkContext) => Promise<unknown>;
}

export interface InterlinkContext {
    sourceBotId: string;
    sourcePlugin?: string;
    userId?: string;
    guildId?: string;
    channelId?: string;
    timestamp: number;
    authToken?: string;
}