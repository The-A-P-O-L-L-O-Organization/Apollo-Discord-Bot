// Automod Command
// Configure automatic moderation settings per server
import { logger } from '../../../utils/logger.js';

import type { ChatInputCommandInteraction } from 'discord.js';
import { PermissionsBitField, EmbedBuilder, ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { safeError } from '../../../utils/safeError.js';
import { checkMessageAttachments } from '../../../utils/nsfwDetection.js';
import { handleDiscordError, safeReply } from '../../../utils/discordErrors.js';

interface AutomodConfig {
    enabled: boolean;
    bannedWords: string[];
    filterInvites: boolean;
    filterLinks: boolean;
    filterPhishingLinks: boolean;
    raidDetection: boolean;
    maxMentions: number;
    maxCapsPercent: number;
    minAccountAge: number;
    spamThreshold: number;
    spamInterval: number;
    aiModeration: boolean;
    nsfwFilter: boolean;
    exemptChannels: string[];
    exemptRoles: string[];
}

export default {
    name: 'automod',
    description: 'Configure automatic moderation',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        { name: 'enable', description: 'Enable automod for this server', type: 1 },
        { name: 'disable', description: 'Disable automod for this server', type: 1 },
        { name: 'status', description: 'View current automod configuration', type: 1 },
        { name: 'addword', description: 'Add a word to the banned words list', type: 1, options: [{ name: 'word', description: 'The word to ban', type: 3, required: true }] },
        { name: 'removeword', description: 'Remove a word from the banned words list', type: 1, options: [{ name: 'word', description: 'The word to remove', type: 3, required: true }] },
        { name: 'listwords', description: 'List all banned words', type: 1 },
        { name: 'set', description: 'Configure an automod setting', type: 1, options: [
            { name: 'setting', description: 'The setting to configure', type: 3, required: true, choices: [
                { name: 'Filter Invites', value: 'filterInvites' },
                { name: 'Filter Links', value: 'filterLinks' },
                { name: 'Filter Phishing Links', value: 'filterPhishingLinks' },
                { name: 'Raid Detection', value: 'raidDetection' },
                { name: 'Max Mentions', value: 'maxMentions' },
                { name: 'Max Caps Percent', value: 'maxCapsPercent' },
                { name: 'Min Account Age (days)', value: 'minAccountAge' },
                { name: 'Spam Threshold', value: 'spamThreshold' },
                { name: 'Spam Interval (ms)', value: 'spamInterval' },
                { name: 'AI Moderation', value: 'aiModeration' },
                { name: 'NSFW Filter', value: 'nsfwFilter' }
            ]},
            { name: 'value', description: 'The value to set (true/false for toggles, number for limits)', type: 3, required: true }
        ]},
        { name: 'exemptchannel', description: 'Add/remove a channel from automod exemptions', type: 1, options: [
            { name: 'channel', description: 'The channel to exempt', type: 7, required: true, channel_types: [ChannelType.GuildText] },
            { name: 'action', description: 'Add or remove exemption', type: 3, required: true, choices: [{ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }] }
        ]},
        { name: 'exemptrole', description: 'Add/remove a role from automod exemptions', type: 1, options: [
            { name: 'role', description: 'The role to exempt', type: 8, required: true },
            { name: 'action', description: 'Add or remove exemption', type: 3, required: true, choices: [{ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }] }
        ]},
        { name: 'scan', description: 'Scan messages for NSFW content', type: 1, options: [
            { name: 'channel', description: 'Channel to scan', type: 7, required: true, channel_types: [ChannelType.GuildText] },
            { name: 'limit', description: 'Number of messages to scan (1-1000)', type: 4, required: false, min_value: 1, max_value: 1000 },
            { name: 'user', description: 'User to filter by (optional)', type: 6, required: false },
            { name: 'delete', description: 'Delete detected NSFW messages', type: 5, required: false }
        ]}
    ],
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure automatic moderation')
        .addSubcommand(sub => sub
            .setName('enable')
            .setDescription('Enable automod for this server')
        )
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable automod for this server')
        )
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View current automod configuration')
        )
        .addSubcommand(sub => sub
            .setName('addword')
            .setDescription('Add a word to the banned words list')
            .addStringOption(opt => opt
                .setName('word')
                .setDescription('The word to ban')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('removeword')
            .setDescription('Remove a word from the banned words list')
            .addStringOption(opt => opt
                .setName('word')
                .setDescription('The word to remove')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('listwords')
            .setDescription('List all banned words')
        )
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Configure an automod setting')
            .addStringOption(opt => opt
                .setName('setting')
                .setDescription('The setting to configure')
                .setRequired(true)
                .addChoices(
                    { name: 'Filter Invites', value: 'filterInvites' },
                    { name: 'Filter Links', value: 'filterLinks' },
                    { name: 'Filter Phishing Links', value: 'filterPhishingLinks' },
                    { name: 'Raid Detection', value: 'raidDetection' },
                    { name: 'Max Mentions', value: 'maxMentions' },
                    { name: 'Max Caps Percent', value: 'maxCapsPercent' },
                    { name: 'Min Account Age (days)', value: 'minAccountAge' },
                    { name: 'Spam Threshold', value: 'spamThreshold' },
                    { name: 'Spam Interval (ms)', value: 'spamInterval' },
                    { name: 'AI Moderation', value: 'aiModeration' },
                    { name: 'NSFW Filter', value: 'nsfwFilter' }
                )
            )
            .addStringOption(opt => opt
                .setName('value')
                .setDescription('The value to set (true/false for toggles, number for limits)')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('exemptchannel')
            .setDescription('Add/remove a channel from automod exemptions')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('The channel to exempt')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Add or remove exemption')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                )
            )
        )
        .addSubcommand(sub => sub
            .setName('exemptrole')
            .setDescription('Add/remove a role from automod exemptions')
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('The role to exempt')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Add or remove exemption')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                )
            )
        )
        .addSubcommand(sub => sub
            .setName('scan')
            .setDescription('Scan messages for NSFW content')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to scan')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of messages to scan (1-1000)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000)
            )
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to filter by (optional)')
                .setRequired(false)
            )
            .addBooleanOption(opt => opt
                .setName('delete')
                .setDescription('Delete detected NSFW messages')
                .setRequired(false)
            )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            switch (subcommand) {
            case 'enable':
                await handleEnable(interaction);
                break;
            case 'disable':
                await handleDisable(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
            case 'addword':
                await handleAddWord(interaction);
                break;
            case 'removeword':
                await handleRemoveWord(interaction);
                break;
            case 'listwords':
                await handleListWords(interaction);
                break;
            case 'set':
                await handleSet(interaction);
                break;
            case 'exemptchannel':
                await handleExemptChannel(interaction);
                break;
            case 'exemptrole':
                await handleExemptRole(interaction);
                break;
            case 'scan':
                await handleScan(interaction);
                break;
            }
        } catch (error) {
            const userMessage = handleDiscordError(error);
            if (userMessage) {
                await safeReply(interaction, userMessage);
            }
        }
    }
};

async function getAutomodConfig(guildId: string): Promise<AutomodConfig> {
    const guildConfig = await getGuildData('automod', guildId);
    return {
        enabled: guildConfig['enabled'] ?? config.automod.enabled,
        bannedWords: guildConfig['bannedWords'] ?? [],
        filterInvites: guildConfig['filterInvites'] ?? config.automod.filterInvites,
        filterLinks: guildConfig['filterLinks'] ?? config.automod.filterLinks,
        filterPhishingLinks: guildConfig['filterPhishingLinks'] ?? config.automod.filterPhishingLinks,
        raidDetection: guildConfig['raidDetection'] ?? config.automod.raidDetection,
        maxMentions: guildConfig['maxMentions'] ?? config.automod.maxMentions,
        maxCapsPercent: guildConfig['maxCapsPercent'] ?? config.automod.maxCapsPercent,
        minAccountAge: guildConfig['minAccountAge'] ?? config.automod.minAccountAge,
        spamThreshold: guildConfig['spamThreshold'] ?? config.automod.spamThreshold,
        spamInterval: guildConfig['spamInterval'] ?? config.automod.spamInterval,
        aiModeration: guildConfig['aiModeration'] ?? config.automod.aiModeration,
        nsfwFilter: guildConfig['nsfwFilter'] ?? config.automod.nsfwFilter,
        exemptChannels: guildConfig['exemptChannels'] ?? [],
        exemptRoles: guildConfig['exemptRoles'] ?? []
    };
}

async function handleEnable(interaction: ChatInputCommandInteraction) {
    const cfg = await getGuildData('automod', interaction.guild!.id);
    cfg['enabled'] = true;
    await setGuildData('automod', interaction.guild!.id, cfg);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Automod Enabled')
        .setDescription('Automatic moderation is now **enabled** for this server.')
        .addFields({
            name: 'Next Steps',
            value: '• Use `/automod addword <word>` to add banned words\n' +
                   '• Use `/automod set` to configure filters\n' +
                   '• Use `/automod status` to view settings'
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ msg: '[AUTOMOD] Enabled', guild: interaction.guild!.name });
}

async function handleDisable(interaction: ChatInputCommandInteraction) {
    const cfg = await getGuildData('automod', interaction.guild!.id);
    cfg['enabled'] = false;
    await setGuildData('automod', interaction.guild!.id, cfg);

    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Automod Disabled')
        .setDescription('Automatic moderation is now **disabled** for this server.')
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ msg: '[AUTOMOD] Disabled', guild: interaction.guild!.name });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
    const cfg = await getAutomodConfig(interaction.guild!.id);

    const embed = new EmbedBuilder()
        .setColor(cfg.enabled ? '#00FF00' : '#FF0000')
        .setTitle('Automod Configuration')
        .setDescription(`Status: ${cfg.enabled ? 'Enabled' : 'Disabled'}`)
        .addFields(
            { name: 'Filter Invites', value: cfg.filterInvites ? 'Yes' : 'No', inline: true },
            { name: 'Filter Links', value: cfg.filterLinks ? 'Yes' : 'No', inline: true },
            { name: 'Filter Phishing Links', value: cfg.filterPhishingLinks ? 'Yes' : 'No', inline: true },
            { name: 'Raid Detection', value: cfg.raidDetection ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Max Mentions', value: `${cfg.maxMentions}`, inline: true },
            { name: 'Max Caps %', value: `${cfg.maxCapsPercent}%`, inline: true },
            { name: 'Min Account Age', value: cfg.minAccountAge > 0 ? `${cfg.minAccountAge} days` : 'Disabled', inline: true },
            { name: 'Spam Threshold', value: `${cfg.spamThreshold} msgs / ${cfg.spamInterval / 1000}s`, inline: true },
            { name: 'Banned Words', value: cfg.bannedWords.length > 0 ? `${cfg.bannedWords.length} word(s)` : 'None configured', inline: true },
            { name: 'Exempt Channels', value: `${cfg.exemptChannels.length} channel(s)`, inline: true },
            { name: 'Exempt Roles', value: `${cfg.exemptRoles.length} role(s)`, inline: true },
            { name: 'AI Moderation', value: cfg.aiModeration ? 'Enabled' : 'Disabled', inline: true },
            { name: 'NSFW Filter', value: cfg.nsfwFilter ? 'Enabled' : 'Disabled', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Use /automod set to modify settings' });

    await interaction.reply({ embeds: [embed] });
}

async function handleAddWord(interaction: ChatInputCommandInteraction) {
    const word = interaction.options.getString('word', true).toLowerCase();
    const guildConfig = await getGuildData('automod', interaction.guild!.id);

    guildConfig['bannedWords'] ??= [];

    if (guildConfig['bannedWords'].includes(word)) {
        return interaction.reply({
            embeds: [{
                color: 0xFFFF00,
                title: 'Word Already Banned',
                description: `The word \`${word}\` is already in the banned list.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }

    guildConfig['bannedWords'].push(word);
    await setGuildData('automod', interaction.guild!.id, guildConfig);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Word Added')
        .setDescription(`Added \`${word}\` to the banned words list.`)
        .addFields({ name: 'Total Banned Words', value: `${guildConfig['bannedWords'].length}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info({ msg: '[AUTOMOD] Added banned word', guild: interaction.guild!.name });
}

async function handleRemoveWord(interaction: ChatInputCommandInteraction) {
    const word = interaction.options.getString('word', true).toLowerCase();
    const guildConfig = await getGuildData('automod', interaction.guild!.id);

    if (!guildConfig['bannedWords']?.includes(word)) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: 'Word Not Found',
                description: `The word \`${word}\` is not in the banned list.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }

    guildConfig['bannedWords'] = guildConfig['bannedWords'].filter(w => w !== word);
    await setGuildData('automod', interaction.guild!.id, guildConfig);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Word Removed')
        .setDescription(`Removed \`${word}\` from the banned words list.`)
        .addFields({ name: 'Total Banned Words', value: `${guildConfig['bannedWords'].length}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info({ msg: '[AUTOMOD] Removed banned word', guild: interaction.guild!.name });
}

async function handleListWords(interaction: ChatInputCommandInteraction) {
    const cfg = await getAutomodConfig(interaction.guild!.id);

    if (cfg.bannedWords.length === 0) {
        return interaction.reply({
            embeds: [{
                color: 0xFFFF00,
                title: 'Banned Words List',
                description: 'No banned words configured.\n\nUse `/automod addword <word>` to add words.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }

    // Censor the words partially for display
    const censoredWords = cfg.bannedWords.map(w => {
        if (w.length <= 2) { return '*'.repeat(w.length); }
        return w[0] + '*'.repeat(w.length - 2) + w[w.length - 1];
    });

    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Banned Words List')
        .setDescription(`**${cfg.bannedWords.length}** word(s) banned:\n\n${censoredWords.join(', ')}`)
        .setTimestamp()
        .setFooter({ text: 'Words are partially censored for safety' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSet(interaction: ChatInputCommandInteraction) {
    const setting = interaction.options.getString('setting', true);
    const valueStr = interaction.options.getString('value', true);

    // Parse value based on setting type
    let value: boolean | number;
    const booleanSettings = ['filterInvites', 'filterLinks', 'filterPhishingLinks', 'raidDetection', 'aiModeration', 'nsfwFilter'];
    const numberSettings = ['maxMentions', 'maxCapsPercent', 'minAccountAge', 'spamThreshold', 'spamInterval'];

    if (booleanSettings.includes(setting)) {
        value = valueStr.toLowerCase() === 'true' || valueStr === '1';
    } else if (numberSettings.includes(setting)) {
        value = parseInt(valueStr);
        if (isNaN(value)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: 'Invalid Value',
                    description: `Please provide a number for ${setting}.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        // Validate ranges
        if (setting === 'maxCapsPercent' && (value < 0 || value > 100)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: 'Invalid Value',
                    description: 'Max caps percent must be between 0 and 100.',
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        // Validate positive numbers for numeric settings (except maxCapsPercent which can be 0)
        if (setting !== 'maxCapsPercent' && value <= 0) {
            return interaction.reply({
                content: `${setting} must be a positive number greater than zero.`,
                flags: MessageFlags.Ephemeral
            });
        }
    } else {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: 'Invalid Setting',
                description: `Unknown setting: ${setting}`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }

    const cfg = await getGuildData('automod', interaction.guild!.id);
    cfg[setting] = value;
    await setGuildData('automod', interaction.guild!.id, cfg);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Setting Updated')
        .setDescription(`**${setting}** has been set to **${value}**.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ msg: '[AUTOMOD] Setting updated', setting, value, guild: interaction.guild!.name });
}

async function handleExemptChannel(interaction: ChatInputCommandInteraction) {
    const channel = interaction.options.getChannel('channel', true);
    const action = interaction.options.getString('action', true);

    const guildConfig = await getGuildData('automod', interaction.guild!.id);
    guildConfig['exemptChannels'] ??= [];

    if (action === 'add') {
        if (guildConfig['exemptChannels'].includes(channel.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: 'Already Exempt',
                    description: `${channel} is already exempt from automod.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        guildConfig['exemptChannels'].push(channel.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: 'Channel Exempted',
                description: `${channel} is now exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    } else {
        if (!guildConfig['exemptChannels'].includes(channel.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: 'Not Exempt',
                    description: `${channel} is not currently exempt.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        guildConfig['exemptChannels'] = guildConfig['exemptChannels'].filter(id => id !== channel.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: 'Exemption Removed',
                description: `${channel} is no longer exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    }
}

async function handleExemptRole(interaction: ChatInputCommandInteraction) {
    const role = interaction.options.getRole('role', true);
    const action = interaction.options.getString('action', true);

    const guildConfig = await getGuildData('automod', interaction.guild!.id);
    guildConfig['exemptRoles'] ??= [];

    if (action === 'add') {
        if (guildConfig['exemptRoles'].includes(role.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: 'Already Exempt',
                    description: `${role} is already exempt from automod.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        guildConfig['exemptRoles'].push(role.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: 'Role Exempted',
                description: `${role} is now exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    } else {
        if (!guildConfig['exemptRoles'].includes(role.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: 'Not Exempt',
                    description: `${role} is not currently exempt.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        guildConfig['exemptRoles'] = guildConfig['exemptRoles'].filter(id => id !== role.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: 'Exemption Removed',
                description: `${role} is no longer exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    }
}

async function handleScan(interaction: ChatInputCommandInteraction) {
    try {
        const channel = interaction.options.getChannel('channel', true);
        const limit = interaction.options.getInteger('limit') ?? 100;
        const user = interaction.options.getUser('user');
        const deleteEnabled = interaction.options.getBoolean('delete') ?? false;

        // Check if NSFW filter is enabled for this guild
        const cfg = await getAutomodConfig(interaction.guild!.id);
        if (!cfg.nsfwFilter) {
            return interaction.reply({ content: 'NSFW filter is disabled for this server.', flags: MessageFlags.Ephemeral });
        }

        // Validate channel is text-based and in guild
        if (!channel.isTextBased() || !channel.guild) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: 'Invalid Channel',
                    description: 'Please select a text channel in this server.',
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if bot can read messages in the channel
        if (!channel.viewable) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: 'Permission Denied',
                    description: 'I cannot view messages in that channel.',
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let messagesScanned = 0;
        let nsfwFound = 0;
        let messagesDeleted = 0;
        let lastId = null;
        const batchSize = 100; // Discord API limit per request

        // Fetch and scan messages in batches
        while (messagesScanned < limit) {
            const remaining = limit - messagesScanned;
            const fetchCount = Math.min(batchSize, remaining);
            const options = {
                limit: fetchCount,
                before: lastId
            };

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) { break; }

            for (const [, msg] of messages) {
                // Skip if user filter is set and doesn't match
                if (user && msg.author.id !== user.id) { continue; }
                // Check if channel is exempt
                if (cfg.exemptChannels?.includes(msg.channel.id)) { continue; }
                // Check if any of the member's roles are exempt
                if (cfg.exemptRoles?.some(r => msg.member?.roles.cache.has(r))) { continue; }

                // Check message attachments for NSFW
                const result = await checkMessageAttachments(interaction.guild!.id, msg);
                messagesScanned++;

                if (result) {
                    nsfwFound++;
                    if (deleteEnabled && result.shouldDelete) {
                        // Check if bot has permission to delete messages in this channel
                        if (channel.permissionsFor(interaction.guild!.members.me!).has(PermissionsBitField.Flags.ManageMessages)) {
                            try {
                                await msg.delete();
                                messagesDeleted++;
                            } catch (delError) {
                                logger.error({ msg: '[ERROR] Failed to delete NSFW message', error: delError, messageId: msg.id });
                            }
                        }
                    }
                }

                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

                // Update progress every 100 messages or at the end
                if (messagesScanned % 100 === 0 || messagesScanned === limit) {
                    await interaction.editReply({
                        embeds: [{
                            color: 0x0099FF,
                            title: 'NSFW Scan Progress',
                            description: `Scanning messages in ${channel}...`,
                            fields: [
                                { name: 'Messages Scanned', value: `${messagesScanned}/${limit}`, inline: true },
                                { name: 'NSFW Detected', value: `${nsfwFound}`, inline: true },
                                { name: 'Messages Deleted', value: `${messagesDeleted}`, inline: true }
                            ],
                            timestamp: new Date().toISOString()
                        }]
                    });
                }

                if (messagesScanned >= limit) { break; }
            }

            // Set lastId to the oldest message in this batch for pagination
            const oldestMessage = messages.last();
            if (oldestMessage) {
                lastId = oldestMessage.id;
            } else {
                break;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Final results
        const embed = new EmbedBuilder()
            .setColor(nsfwFound > 0 ? '#FF0000' : '#00FF00')
            .setTitle('NSFW Scan Complete')
            .setDescription(`Finished scanning ${messagesScanned} messages in ${channel}`)
            .addFields(
                { name: 'NSFW Content Detected', value: `${nsfwFound}`, inline: true },
                { name: 'Messages Deleted', value: `${messagesDeleted}`, inline: true },
                { name: 'Channel', value: channel.toString(), inline: true }
            )
            .setTimestamp();

        if (user) {
            embed.addFields({ name: 'User Filter', value: user.toString(), inline: true });
        }
        if (deleteEnabled) {
            embed.addFields({ name: 'Delete Enabled', value: 'Yes', inline: true });
        }

        await interaction.editReply({ embeds: [embed] });
        logger.info({ msg: '[AUTOMOD] NSFW scan completed', channel: channel.name, guild: interaction.guild!.name });

    } catch (error) {
        await interaction.editReply({
            embeds: [{
                color: 0xFF0000,
                title: 'Scan Failed',
                description: 'An error occurred during the NSFW scan.',
                fields: [{ name: 'Error', value: safeError(error) }],
                timestamp: new Date().toISOString()
            }]
        });
        logger.error({ msg: '[ERROR] NSFW scan error', error });
    }
}