import { z } from 'zod';

// Warning entry schema
const WarningEntrySchema = z.object({
    id: z.string(),
    reason: z.string(),
    timestamp: z.number().int().nonnegative(),
    moderatorTag: z.string().optional(),
    moderatorId: z.string().optional(),
    active: z.boolean().optional(),
    clearedBy: z.string().optional(),
    clearedByTag: z.string().optional(),
    clearedAt: z.number().int().nonnegative().optional(),
    clearReason: z.string().optional(),
});

export type WarningEntry = z.infer<typeof WarningEntrySchema>;

// Base known fields for guild config
const GuildKnownFieldsSchema = z.object({
    // Moderation settings
    modLogChannel: z.string().nullable().optional(),
    muteRole: z.string().nullable().optional(),
    banDmTemplate: z.string().nullable().optional(),
    caseNumber: z.number().int().nonnegative().optional(),
    slowmodeDefault: z.number().int().nonnegative().optional(),

    // Automod settings
    automodEnabled: z.boolean().optional(),
    bannedWords: z.array(z.string()).optional(),
    linkFilter: z.boolean().optional(),
    inviteFilter: z.boolean().optional(),
    spamThreshold: z.number().int().positive().optional(),
    spamWindow: z.number().int().positive().optional(),
    exemptRoles: z.array(z.string()).optional(),
    exemptChannels: z.array(z.string()).optional(),

    // Ticket settings
    ticketCategory: z.string().nullable().optional(),
    ticketLogChannel: z.string().nullable().optional(),
    ticketSupportRoles: z.array(z.string()).optional(),
    ticketAutoClose: z.number().int().nonnegative().optional(),
    ticketTranscriptChannel: z.string().nullable().optional(),

    // Integration settings
    youtubeChannel: z.string().nullable().optional(),
    twitchChannel: z.string().nullable().optional(),
    twitterUser: z.string().nullable().optional(),
    rssFeeds: z.array(z.object({
        url: z.string().url(),
        channel: z.string(),
        filter: z.string().optional(),
    })).optional(),

    // Utility settings
    prefix: z.string().optional(),
    language: z.string().optional(),
    timezone: z.string().optional(),
    welcomeChannel: z.string().nullable().optional(),
    welcomeMessage: z.string().nullable().optional(),
    leaveMessage: z.string().nullable().optional(),
    autoroles: z.array(z.string()).optional(),

    // Interlink settings
    interlinkEnabled: z.boolean().optional(),
    interlinkApiKey: z.string().nullable().optional(),
    interlinkTrustedBots: z.array(z.string()).optional(),

    // Custom plugin data (catch-all)
    custom: z.record(z.string(), z.unknown()).optional(),
});

// Schema that passes through unknown keys at runtime
export const GuildConfigSchema = GuildKnownFieldsSchema.passthrough();

// Type with index signature for TypeScript
export type GuildConfig = z.infer<typeof GuildConfigSchema> & Record<string, unknown>;

// Base known fields for user config
const UserKnownFieldsSchema = z.object({
    // User preferences
    language: z.string().optional(),
    timezone: z.string().optional(),
    dmNotifications: z.boolean().optional(),

    // Moderation history
    warnings: z.array(WarningEntrySchema).optional(),
    mutes: z.number().int().nonnegative().optional(),
    kicks: z.number().int().nonnegative().optional(),
    bans: z.number().int().nonnegative().optional(),

    // Ticket data
    openTickets: z.array(z.string()).optional(),
    ticketCount: z.number().int().nonnegative().optional(),

    // Economy/currency (if plugins add it)
    balance: z.number().int().nonnegative().optional(),
    dailyStreak: z.number().int().nonnegative().optional(),
    lastDaily: z.number().int().nonnegative().optional(),

    // Custom plugin data (catch-all)
    custom: z.record(z.string(), z.unknown()).optional(),
});

export const UserConfigSchema = UserKnownFieldsSchema.passthrough();
export type UserConfig = z.infer<typeof UserConfigSchema> & Record<string, unknown>;

// Base known fields for global config
const GlobalKnownFieldsSchema = z.object({
    // Bot-wide settings
    maintenanceMode: z.boolean().optional(),
    blacklistedGuilds: z.array(z.string()).optional(),
    blacklistedUsers: z.array(z.string()).optional(),

    // Analytics/aggregated data
    totalGuilds: z.number().int().nonnegative().optional(),
    totalUsers: z.number().int().nonnegative().optional(),
    totalCommands: z.number().int().nonnegative().optional(),

    // Version/migration tracking
    schemaVersion: z.number().int().nonnegative().optional(),
    lastMigration: z.string().optional(),

    // Custom global data
    custom: z.record(z.string(), z.unknown()).optional(),
});

export const GlobalConfigSchema = GlobalKnownFieldsSchema.passthrough();
export type GlobalConfig = z.infer<typeof GlobalConfigSchema> & Record<string, unknown>;

// Store name -> schema mapping
export const STORE_SCHEMAS: Record<string, z.ZodSchema> = {
    config: GuildConfigSchema,
    automod: GuildConfigSchema,
    tickets: GuildConfigSchema,
    integrations: GuildConfigSchema,
    utility: GuildConfigSchema,
    moderation: GuildConfigSchema,
    interlink: GuildConfigSchema,
    global: GlobalConfigSchema,
    user: UserConfigSchema,
} as const;

export type StoreName = keyof typeof STORE_SCHEMAS;

// Typed getter/setter helpers
export function getSchemaForStore(store: string): z.ZodSchema | undefined {
    return STORE_SCHEMAS[store as StoreName];
}

export function validateGuildData(store: string, data: unknown): GuildConfig {
    const schema = getSchemaForStore(store);
    if (!schema) {
        return GuildConfigSchema.parse(data);
    }
    return schema.parse(data) as GuildConfig;
}

export function validateUserData(store: string, data: unknown): UserConfig {
    const schema = getSchemaForStore(store);
    if (!schema) {
        return UserConfigSchema.parse(data);
    }
    return schema.parse(data) as UserConfig;
}

export function validateGlobalData(data: unknown): GlobalConfig {
    return GlobalConfigSchema.parse(data);
}