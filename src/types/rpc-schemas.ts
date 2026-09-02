// Zod schemas for RPC validation
// All RPC method schemas with strict validation

import { z } from 'zod';

// Base schemas
export const RPCMessageSchema = z.object({
    id: z.string().uuid(),
    namespace: z.string().min(1).max(100),
    method: z.string().min(1).max(100),
    params: z.unknown(),
    timestamp: z.number().int().positive(),
    correlationId: z.string().uuid().optional()
});

export const RPCResponseSchema = z.object({
    id: z.string().uuid(),
    result: z.unknown().optional(),
    error: z.object({
        code: z.number().int(),
        message: z.string(),
        data: z.unknown().optional()
    }).optional(),
    timestamp: z.number().int().positive()
});

export const RPCErrorSchema = z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional()
});

// Worker RPC schemas
export const WorkerJobDataSchema = z.object({
    jobId: z.string().uuid(),
    jobName: z.string().min(1).max(100),
    data: z.unknown(),
    attemptsMade: z.number().int().nonnegative(),
    timestamp: z.number().int().positive()
});

export const WorkerResultSchema = z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
    duration: z.number().int().nonnegative()
});

// Gateway RPC schemas
export const ShardInfoSchema = z.object({
    id: z.number().int().nonnegative(),
    status: z.enum(['connecting', 'ready', 'disconnected', 'reconnecting', 'resuming']),
    guilds: z.number().int().nonnegative(),
    latency: z.number().nonnegative(),
    memoryUsage: z.number().nonnegative(),
    cpuUsage: z.number().nonnegative(),
    lastHeartbeat: z.number().int().positive()
});

export const GatewayCommandPayloadSchema = z.object({
    shardId: z.number().int().nonnegative().optional(),
    type: z.enum(['eval', 'restart', 'status', 'broadcast', 'guildAction']),
    payload: z.unknown()
});

// Interlink RPC schemas
export const InterlinkContextSchema = z.object({
    sourceBotId: z.string().min(1),
    sourcePlugin: z.string().optional(),
    userId: z.string().optional(),
    guildId: z.string().optional(),
    channelId: z.string().optional(),
    timestamp: z.number().int().positive(),
    authToken: z.string().optional()
});

export const InterlinkRPCMessageSchema = z.object({
    id: z.string().uuid(),
    namespace: z.string().min(1).max(100),
    method: z.string().min(1).max(100),
    params: z.unknown(),
    timestamp: z.number().int().positive(),
    correlationId: z.string().uuid().optional(),
    sourceBotId: z.string().min(1),
    targetBotId: z.string().optional(),
    broadcast: z.boolean().optional()
});

// Queue job schemas
export const ProcessCommandJobSchema = z.object({
    interaction: z.object({
        id: z.string(),
        type: z.number().int(),
        guildId: z.string().nullable(),
        channelId: z.string(),
        user: z.object({
            id: z.string(),
            username: z.string(),
            discriminator: z.string(),
            avatar: z.string().nullable(),
            bot: z.boolean()
        }),
        member: z.object({
            user: z.object({
                id: z.string(),
                username: z.string(),
                discriminator: z.string(),
                avatar: z.string().nullable(),
                bot: z.boolean()
            }),
            roles: z.array(z.string()),
            joinedAt: z.string().nullable(),
            premiumSince: z.string().nullable(),
            permissions: z.string(),
            pending: z.boolean()
        }).nullable(),
        data: z.object({
            id: z.string(),
            name: z.string(),
            type: z.number().int(),
            options: z.array(z.unknown()).optional()
        }).optional(),
        token: z.string(),
        version: z.number().int(),
        appPermissions: z.string().nullable(),
        locale: z.string(),
        guildLocale: z.string().optional(),
        entitlements: z.array(z.unknown())
    }),
    serialized: z.instanceof(Uint8Array),
    timestamp: z.number().int().positive()
});

export const HeavyOperationJobSchema = z.object({
    operation: z.string().min(1),
    data: z.unknown(),
    priority: z.number().int().optional(),
    timeout: z.number().int().positive().optional()
});

export const ScheduledTaskJobSchema = z.object({
    taskName: z.string().min(1),
    cron: z.string().optional(),
    interval: z.number().int().positive().optional(),
    data: z.unknown().optional()
});

export const NSFWAnalyzeJobSchema = z.object({
    imageUrl: z.string().url(),
    guildId: z.string(),
    threshold: z.number().min(0).max(1).default(0.6),
    attachmentName: z.string().optional(),
    attachmentId: z.string().optional()
});

// Plugin RPC schemas
export const PluginRPCRegisterSchema = z.object({
    namespace: z.string().min(1).max(100),
    version: z.string().regex(/^\d+\.\d+\.\d+/),
    methods: z.array(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        paramsSchema: z.record(z.unknown()).optional(),
        resultSchema: z.record(z.unknown()).optional()
    }))
});

export const PluginRPCCallSchema = z.object({
    namespace: z.string().min(1).max(100),
    method: z.string().min(1).max(100),
    params: z.unknown().optional(),
    timeout: z.number().int().positive().optional()
});

// Database RPC schemas
export const DatabaseGetSchema = z.object({
    key: z.string().min(1),
    guildId: z.string().optional(),
    userId: z.string().optional()
});

export const DatabaseSetSchema = z.object({
    key: z.string().min(1),
    value: z.unknown(),
    guildId: z.string().optional(),
    userId: z.string().optional()
});

// Analytics RPC schemas
export const AnalyticsTrackMessageSchema = z.object({
    guildId: z.string(),
    channelId: z.string(),
    userId: z.string(),
    messageLength: z.number().int().nonnegative(),
    hasAttachments: z.boolean(),
    hasEmbeds: z.boolean()
});

export const AnalyticsTrackViolationSchema = z.object({
    guildId: z.string(),
    userId: z.string(),
    type: z.string().min(1),
    action: z.string().min(1),
    details: z.record(z.unknown()).optional()
});

// Moderation RPC schemas
export const ModerationActionSchema = z.object({
    guildId: z.string(),
    userId: z.string(),
    moderatorId: z.string(),
    type: z.enum(['ban', 'kick', 'timeout', 'warn', 'mute', 'unmute', 'unban']),
    reason: z.string().min(1).max(1000),
    duration: z.number().int().positive().optional(),
    deleteMessageSeconds: z.number().int().min(0).max(604800).optional()
});

// Export all schemas as a registry
export const RPCSchemas = {
    // Base
    RPCMessage: RPCMessageSchema,
    RPCResponse: RPCResponseSchema,
    RPCError: RPCErrorSchema,
    // Worker
    WorkerJobData: WorkerJobDataSchema,
    WorkerResult: WorkerResultSchema,
    // Gateway
    ShardInfo: ShardInfoSchema,
    GatewayCommandPayload: GatewayCommandPayloadSchema,
    // Interlink
    InterlinkContext: InterlinkContextSchema,
    InterlinkRPCMessage: InterlinkRPCMessageSchema,
    // Queue Jobs
    ProcessCommandJob: ProcessCommandJobSchema,
    HeavyOperationJob: HeavyOperationJobSchema,
    ScheduledTaskJob: ScheduledTaskJobSchema,
    NSFWAnalyzeJob: NSFWAnalyzeJobSchema,
    // Plugin RPC
    PluginRPCRegister: PluginRPCRegisterSchema,
    PluginRPCCall: PluginRPCCallSchema,
    // Database
    DatabaseGet: DatabaseGetSchema,
    DatabaseSet: DatabaseSetSchema,
    // Analytics
    AnalyticsTrackMessage: AnalyticsTrackMessageSchema,
    AnalyticsTrackViolation: AnalyticsTrackViolationSchema,
    // Moderation
    ModerationAction: ModerationActionSchema
} as const;

export type RPCSchemasType = typeof RPCSchemas;

// Type inference helpers
export type InferSchema<T extends z.ZodTypeAny> = z.infer<T>;
export type ProcessCommandJob = InferSchema<typeof ProcessCommandJobSchema>;
export type HeavyOperationJob = InferSchema<typeof HeavyOperationJobSchema>;
export type ScheduledTaskJob = InferSchema<typeof ScheduledTaskJobSchema>;
export type NSFWAnalyzeJob = InferSchema<typeof NSFWAnalyzeJobSchema>;
export type ShardInfo = InferSchema<typeof ShardInfoSchema>;
export type InterlinkContext = InferSchema<typeof InterlinkContextSchema>;