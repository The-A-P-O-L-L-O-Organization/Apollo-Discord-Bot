import { getGuildData, setGuildData } from '../../../utils/db.js';

interface AutomodConfig {
    enabled: boolean;
    bannedWords: string[];
    filterInvites: boolean;
    filterLinks: boolean;
    maxMentions: number;
    maxCapsPercent: number;
    minAccountAge: number;
    spamThreshold: number;
    spamInterval: number;
    exemptChannels: string[];
    exemptRoles: string[];
    [key: string]: unknown;
}

interface CLIArgs {
    guild: string;
    word?: string;
    setting?: string;
    value?: string;
    channel?: string;
    role?: string;
    action?: string;
}

async function getAutomodConfig(guildId: string): Promise<AutomodConfig> {
    const cfg = (await getGuildData('automod', guildId)) as Partial<AutomodConfig>;
    return {
        enabled: cfg.enabled ?? false,
        bannedWords: cfg.bannedWords ?? [],
        filterInvites: cfg.filterInvites ?? true,
        filterLinks: cfg.filterLinks ?? true,
        maxMentions: cfg.maxMentions ?? 5,
        maxCapsPercent: cfg.maxCapsPercent ?? 70,
        minAccountAge: cfg.minAccountAge ?? 7,
        spamThreshold: cfg.spamThreshold ?? 5,
        spamInterval: cfg.spamInterval ?? 5000,
        exemptChannels: cfg.exemptChannels ?? [],
        exemptRoles: cfg.exemptRoles ?? []
    };
}

interface CLIOption {
    name: string;
    description: string;
    required?: boolean;
    choices?: string[];
}

interface CLICommand {
    name: string;
    description: string;
    options: CLIOption[];
    execute: (args: CLIArgs) => Promise<Record<string, unknown>>;
}

interface CLIModule {
    name: string;
    description: string;
    commands: CLICommand[];
}

const module: CLIModule = {
    name: 'automod',
    description: 'Manage automatic moderation settings',
    commands: [
        {
            name: 'enable',
            description: 'Enable automod for a guild',
            options: [],
            execute: async (args: CLIArgs) => {
                const cfg = await getGuildData('automod', args.guild);
                cfg['enabled'] = true;
                await setGuildData('automod', args.guild, cfg);
                return { success: true, message: 'Automod enabled' };
            }
        },
        {
            name: 'disable',
            description: 'Disable automod for a guild',
            options: [],
            execute: async (args: CLIArgs) => {
                const cfg = await getGuildData('automod', args.guild);
                cfg['enabled'] = false;
                await setGuildData('automod', args.guild, cfg);
                return { success: true, message: 'Automod disabled' };
            }
        },
        {
            name: 'status',
            description: 'View automod configuration',
            options: [],
            execute: async (args: CLIArgs) => {
                const cfg = await getAutomodConfig(args.guild);
                return {
                    enabled: cfg.enabled,
                    bannedWordCount: cfg.bannedWords.length,
                    filterInvites: cfg.filterInvites,
                    filterLinks: cfg.filterLinks,
                    maxMentions: cfg.maxMentions,
                    maxCapsPercent: cfg.maxCapsPercent,
                    minAccountAge: cfg.minAccountAge,
                    spamThreshold: cfg.spamThreshold,
                    spamInterval: cfg.spamInterval,
                    exemptChannels: cfg.exemptChannels.length,
                    exemptRoles: cfg.exemptRoles.length
                };
            }
        },
        {
            name: 'listwords',
            description: 'List all banned words',
            options: [],
            execute: async (args: CLIArgs) => {
                const cfg = await getAutomodConfig(args.guild);
                return { count: cfg.bannedWords.length, words: cfg.bannedWords };
            }
        },
        {
            name: 'addword',
            description: 'Add a banned word',
            options: [
                { name: 'word', description: 'The word to ban', required: true }
            ],
            execute: async (args: CLIArgs) => {
                const word = (args.word!).toLowerCase();
                const guildConfig = (await getGuildData('automod', args.guild)) as Partial<AutomodConfig>;
                guildConfig.bannedWords ??= [];
                if (guildConfig.bannedWords.includes(word)) {
                    return { success: false, message: `"${word}" is already banned` };
                }
                guildConfig.bannedWords.push(word);
                await setGuildData('automod', args.guild, guildConfig);
                return { success: true, message: `"${word}" added to banned words`, total: guildConfig.bannedWords.length };
            }
        },
        {
            name: 'removeword',
            description: 'Remove a banned word',
            options: [
                { name: 'word', description: 'The word to unban', required: true }
            ],
            execute: async (args: CLIArgs) => {
                const word = (args.word!).toLowerCase();
                const guildConfig = (await getGuildData('automod', args.guild)) as Partial<AutomodConfig>;
                if (!guildConfig.bannedWords?.includes(word)) {
                    return { success: false, message: `"${word}" is not in the banned list` };
                }
                guildConfig.bannedWords = guildConfig.bannedWords.filter((w: string) => w !== word);
                await setGuildData('automod', args.guild, guildConfig);
                return { success: true, message: `"${word}" removed from banned words`, total: guildConfig.bannedWords.length };
            }
        },
        {
            name: 'set',
            description: 'Configure an automod setting',
            options: [
                {
                    name: 'setting',
                    description: 'The setting to change',
                    required: true,
                    choices: ['filterInvites', 'filterLinks', 'maxMentions', 'maxCapsPercent', 'minAccountAge', 'spamThreshold', 'spamInterval']
                },
                { name: 'value', description: 'The value to set', required: true }
            ],
            execute: async (args: CLIArgs) => {
                const cfg = (await getGuildData('automod', args.guild)) as Partial<AutomodConfig>;
                const setting = args.setting!;
                const rawValue = args.value!;
                const booleanSettings = ['filterInvites', 'filterLinks'];
                const numberSettings = ['maxMentions', 'maxCapsPercent', 'minAccountAge', 'spamThreshold', 'spamInterval'];
                let value: string | number | boolean;
                if (booleanSettings.includes(setting)) {
                    value = rawValue.toLowerCase() === 'true' || rawValue === '1';
                } else if (numberSettings.includes(setting)) {
                    value = parseInt(rawValue);
                    if (isNaN(value)) {return { success: false, message: `"${rawValue}" is not a valid number` };}
                } else {
                    value = rawValue;
                }
                cfg[setting] = value;
                await setGuildData('automod', args.guild, cfg);
                return { success: true, message: `${setting} set to ${value}` };
            }
        },
        {
            name: 'exemptchannel',
            description: 'Add/remove a channel from automod exemptions',
            options: [
                { name: 'channel', description: 'Channel ID', required: true },
                { name: 'action', description: 'add or remove', required: true, choices: ['add', 'remove'] }
            ],
            execute: async (args: CLIArgs) => {
                const guildConfig = (await getGuildData('automod', args.guild)) as Partial<AutomodConfig>;
                const channelId = args.channel!;
                const channelAction = args.action!;
                guildConfig.exemptChannels ??= [];
                if (channelAction === 'add') {
                    if (guildConfig.exemptChannels.includes(channelId)) {
                        return { success: false, message: 'Channel already exempt' };
                    }
                    guildConfig.exemptChannels.push(channelId);
                } else {
                    guildConfig.exemptChannels = guildConfig.exemptChannels.filter((id: string) => id !== channelId);
                }
                await setGuildData('automod', args.guild, guildConfig);
                return { success: true, message: `Channel ${channelAction === 'add' ? 'added to' : 'removed from'} exemptions` };
            }
        },
        {
            name: 'exemptrole',
            description: 'Add/remove a role from automod exemptions',
            options: [
                { name: 'role', description: 'Role ID', required: true },
                { name: 'action', description: 'add or remove', required: true, choices: ['add', 'remove'] }
            ],
            execute: async (args: CLIArgs) => {
                const guildConfig = (await getGuildData('automod', args.guild)) as Partial<AutomodConfig>;
                const roleId = args.role!;
                const roleAction = args.action!;
                guildConfig.exemptRoles ??= [];
                if (roleAction === 'add') {
                    if (guildConfig.exemptRoles.includes(roleId)) {
                        return { success: false, message: 'Role already exempt' };
                    }
                    guildConfig.exemptRoles.push(roleId);
                } else {
                    guildConfig.exemptRoles = guildConfig.exemptRoles.filter((id: string) => id !== roleId);
                }
                await setGuildData('automod', args.guild, guildConfig);
                return { success: true, message: `Role ${roleAction === 'add' ? 'added to' : 'removed from'} exemptions` };
            }
        }
    ]
};

export default module;