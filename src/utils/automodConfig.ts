import { getGuildData } from './db.js';
import { config } from '../config/config.js';

export interface ChannelOverride {
    threshold?: number;
    interval?: number;
}

export interface AutomodConfig {
    enabled: boolean;
    bannedWords: string[];
    filterInvites: boolean;
    filterLinks: boolean;
    raidDetection: boolean;
    maxMentions: number;
    maxCapsPercent: number;
    minCapsLength: number;
    minAccountAge: number;
    spamThreshold: number;
    spamInterval: number;
    spamChannelOverrides: Record<string, ChannelOverride>;
    aiModeration: boolean;
    nsfwFilter: boolean;
    nsfwThreshold?: number;
    filterPhishingLinks: boolean;
    exemptChannels: string[];
    exemptRoles: string[];
}

/**
 * Gets automod configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<AutomodConfig>} Automod configuration
 */
export async function getAutomodConfig(guildId: string): Promise<AutomodConfig> {
    const guildConfig = await getGuildData('automod', guildId) as Record<string, unknown> | null;
    const automodConfig = (guildConfig ?? {});
    return {
        enabled: (automodConfig['enabled'] as boolean) ?? config.automod.enabled,
        bannedWords: (automodConfig['bannedWords'] as string[]) || [],
        filterInvites: (automodConfig['filterInvites'] as boolean) ?? config.automod.filterInvites,
        filterLinks: (automodConfig['filterLinks'] as boolean) ?? config.automod.filterLinks,
        raidDetection: (automodConfig['raidDetection'] as boolean) ?? config.automod.raidDetection,
        maxMentions: (automodConfig['maxMentions'] as number) ?? config.automod.maxMentions,
        maxCapsPercent: (automodConfig['maxCapsPercent'] as number) ?? config.automod.maxCapsPercent,
        minCapsLength: (automodConfig['minCapsLength'] as number) ?? config.automod.minCapsLength,
        minAccountAge: (automodConfig['minAccountAge'] as number) ?? config.automod.minAccountAge,
        spamThreshold: (automodConfig['spamThreshold'] as number) ?? config.automod.spamThreshold,
        spamInterval: (automodConfig['spamInterval'] as number) ?? config.automod.spamInterval,
        spamChannelOverrides: (automodConfig['spamChannelOverrides'] as Record<string, ChannelOverride>) ?? config.automod.spamChannelOverrides,
        aiModeration: (automodConfig['aiModeration'] as boolean) ?? config.automod.aiModeration,
        nsfwFilter: (automodConfig['nsfwFilter'] as boolean) ?? config.automod.nsfwFilter,
        nsfwThreshold: automodConfig['nsfwThreshold'] as number | undefined,
        filterPhishingLinks: (automodConfig['filterPhishingLinks'] as boolean) ?? config.automod.filterPhishingLinks,
        exemptChannels: (automodConfig['exemptChannels'] as string[]) || [],
        exemptRoles: (automodConfig['exemptRoles'] as string[]) || []
    };
}
