import { getGuildData, setGuildData } from '../../../utils/db.js';

async function getAutomodConfig(guildId) {
    const guildConfig = await getGuildData('automod', guildId);
    return {
        enabled: guildConfig.enabled ?? false,
        bannedWords: guildConfig.bannedWords || [],
        filterInvites: guildConfig.filterInvites ?? true,
        filterLinks: guildConfig.filterLinks ?? true,
        maxMentions: guildConfig.maxMentions ?? 5,
        maxCapsPercent: guildConfig.maxCapsPercent ?? 70,
        minAccountAge: guildConfig.minAccountAge ?? 7,
        spamThreshold: guildConfig.spamThreshold ?? 5,
        spamInterval: guildConfig.spamInterval ?? 5000,
        exemptChannels: guildConfig.exemptChannels || [],
        exemptRoles: guildConfig.exemptRoles || []
    };
}

export default {
    name: 'automod',
    description: 'Manage automatic moderation settings',
    commands: [
        {
            name: 'enable',
            description: 'Enable automod for a guild',
            options: [],
            execute: async (args) => {
                const cfg = await getGuildData('automod', args.guild);
                cfg.enabled = true;
                await setGuildData('automod', args.guild, cfg);
                return { success: true, message: 'Automod enabled' };
            }
        },
        {
            name: 'disable',
            description: 'Disable automod for a guild',
            options: [],
            execute: async (args) => {
                const cfg = await getGuildData('automod', args.guild);
                cfg.enabled = false;
                await setGuildData('automod', args.guild, cfg);
                return { success: true, message: 'Automod disabled' };
            }
        },
        {
            name: 'status',
            description: 'View automod configuration',
            options: [],
            execute: async (args) => {
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
            execute: async (args) => {
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
            execute: async (args) => {
                const word = args.word.toLowerCase();
                const guildConfig = await getGuildData('automod', args.guild);
                if (!guildConfig.bannedWords) guildConfig.bannedWords = [];
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
            execute: async (args) => {
                const word = args.word.toLowerCase();
                const guildConfig = await getGuildData('automod', args.guild);
                if (!guildConfig.bannedWords || !guildConfig.bannedWords.includes(word)) {
                    return { success: false, message: `"${word}" is not in the banned list` };
                }
                guildConfig.bannedWords = guildConfig.bannedWords.filter(w => w !== word);
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
            execute: async (args) => {
                const cfg = await getGuildData('automod', args.guild);
                const booleanSettings = ['filterInvites', 'filterLinks'];
                const numberSettings = ['maxMentions', 'maxCapsPercent', 'minAccountAge', 'spamThreshold', 'spamInterval'];
                let value;
                if (booleanSettings.includes(args.setting)) {
                    value = args.value.toLowerCase() === 'true' || args.value === '1';
                } else if (numberSettings.includes(args.setting)) {
                    value = parseInt(args.value);
                    if (isNaN(value)) return { success: false, message: `"${args.value}" is not a valid number` };
                } else {
                    value = args.value;
                }
                cfg[args.setting] = value;
                await setGuildData('automod', args.guild, cfg);
                return { success: true, message: `${args.setting} set to ${value}` };
            }
        },
        {
            name: 'exemptchannel',
            description: 'Add/remove a channel from automod exemptions',
            options: [
                { name: 'channel', description: 'Channel ID', required: true },
                { name: 'action', description: 'add or remove', required: true, choices: ['add', 'remove'] }
            ],
            execute: async (args) => {
                const guildConfig = await getGuildData('automod', args.guild);
                if (!guildConfig.exemptChannels) guildConfig.exemptChannels = [];
                if (args.action === 'add') {
                    if (guildConfig.exemptChannels.includes(args.channel)) {
                        return { success: false, message: 'Channel already exempt' };
                    }
                    guildConfig.exemptChannels.push(args.channel);
                } else {
                    guildConfig.exemptChannels = guildConfig.exemptChannels.filter(id => id !== args.channel);
                }
                await setGuildData('automod', args.guild, guildConfig);
                return { success: true, message: `Channel ${args.action === 'add' ? 'added to' : 'removed from'} exemptions` };
            }
        },
        {
            name: 'exemptrole',
            description: 'Add/remove a role from automod exemptions',
            options: [
                { name: 'role', description: 'Role ID', required: true },
                { name: 'action', description: 'add or remove', required: true, choices: ['add', 'remove'] }
            ],
            execute: async (args) => {
                const guildConfig = await getGuildData('automod', args.guild);
                if (!guildConfig.exemptRoles) guildConfig.exemptRoles = [];
                if (args.action === 'add') {
                    if (guildConfig.exemptRoles.includes(args.role)) {
                        return { success: false, message: 'Role already exempt' };
                    }
                    guildConfig.exemptRoles.push(args.role);
                } else {
                    guildConfig.exemptRoles = guildConfig.exemptRoles.filter(id => id !== args.role);
                }
                await setGuildData('automod', args.guild, guildConfig);
                return { success: true, message: `Role ${args.action === 'add' ? 'added to' : 'removed from'} exemptions` };
            }
        }
    ]
};
