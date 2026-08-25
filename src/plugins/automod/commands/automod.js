// Automod Command
// Configure automatic moderation settings per server
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField, EmbedBuilder, ChannelType, MessageFlags } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { safeError } from '../../../utils/safeError.js';
import { checkMessageAttachments } from '../../../utils/nsfwDetection.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    name: 'automod',
    description: 'Configure automatic moderation',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'enable',
            description: 'Enable automod for this server',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'disable',
            description: 'Disable automod for this server',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'status',
            description: 'View current automod configuration',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'addword',
            description: 'Add a word to the banned words list',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'word',
                    description: 'The word to ban',
                    type: 3, // STRING type
                    required: true
                }
            ]
        },
        {
            name: 'removeword',
            description: 'Remove a word from the banned words list',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'word',
                    description: 'The word to remove',
                    type: 3, // STRING type
                    required: true
                }
            ]
        },
        {
            name: 'listwords',
            description: 'List all banned words',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'set',
            description: 'Configure an automod setting',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'setting',
                    description: 'The setting to configure',
                    type: 3, // STRING type
                    required: true,
                    choices: [
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
                    ]
                },
                {
                    name: 'value',
                    description: 'The value to set (true/false for toggles, number for limits)',
                    type: 3, // STRING type
                    required: true
                }
            ]
        },
        {
            name: 'exemptchannel',
            description: 'Add/remove a channel from automod exemptions',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'channel',
                    description: 'The channel to exempt',
                    type: 7, // CHANNEL type
                    required: true,
                    channel_types: [ChannelType.GuildText]
                },
                {
                    name: 'action',
                    description: 'Add or remove exemption',
                    type: 3, // STRING type
                    required: true,
                    choices: [
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' }
                    ]
                }
            ]
        },
        {
            name: 'exemptrole',
            description: 'Add/remove a role from automod exemptions',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'role',
                    description: 'The role to exempt',
                    type: 8, // ROLE type
                    required: true
                },
                {
                    name: 'action',
                    description: 'Add or remove exemption',
                    type: 3, // STRING type
                    required: true,
                    choices: [
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' }
                    ]
                }
            ]
        },
        {
            name: 'scan',
            description: 'Scan messages for NSFW content',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'channel',
                    description: 'Channel to scan',
                    type: 7, // CHANNEL type
                    required: true,
                    channel_types: [ChannelType.GuildText] // GuildText
                },
                {
                    name: 'limit',
                    description: 'Number of messages to scan (1-1000)',
                    type: 4, // INTEGER type
                    required: false,
                    min_value: 1,
                    max_value: 1000
                },
                {
                    name: 'user',
                    description: 'User to filter by (optional)',
                    type: 6, // USER type
                    required: false
                },
                {
                    name: 'delete',
                    description: 'Delete detected NSFW messages',
                    type: 5, // BOOLEAN type
                    required: false
                }
            ]
        }
    ],
    
    async execute(interaction) {
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

async function getAutomodConfig(guildId) {
    const guildConfig = await getGuildData('automod', guildId);
    return {
        enabled: guildConfig.enabled ?? config.automod.enabled,
        bannedWords: guildConfig.bannedWords || [],
        filterInvites: guildConfig.filterInvites ?? config.automod.filterInvites,
        filterLinks: guildConfig.filterLinks ?? config.automod.filterLinks,
        filterPhishingLinks: guildConfig.filterPhishingLinks ?? config.automod.filterPhishingLinks,
        raidDetection: guildConfig.raidDetection ?? config.automod.raidDetection,
        maxMentions: guildConfig.maxMentions ?? config.automod.maxMentions,
        maxCapsPercent: guildConfig.maxCapsPercent ?? config.automod.maxCapsPercent,
        minAccountAge: guildConfig.minAccountAge ?? config.automod.minAccountAge,
        spamThreshold: guildConfig.spamThreshold ?? config.automod.spamThreshold,
        spamInterval: guildConfig.spamInterval ?? config.automod.spamInterval,
        aiModeration: guildConfig.aiModeration ?? config.automod.aiModeration,
        nsfwFilter: guildConfig.nsfwFilter ?? config.automod.nsfwFilter,
        exemptChannels: guildConfig.exemptChannels || [],
        exemptRoles: guildConfig.exemptRoles || []
    };
}

async function handleEnable(interaction) {
    const cfg = await getGuildData('automod', interaction.guild.id);
    cfg.enabled = true;
    await setGuildData('automod', interaction.guild.id, cfg);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Automod Enabled')
        .setDescription('Automatic moderation is now **enabled** for this server.')
        .addFields({
            name: 'Next Steps',
            value: '• Use `/automod addword <word>` to add banned words\n' +
                   '• Use `/automod set` to configure filters\n' +
                   '• Use `/automod status` to view settings'
        })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    logger.info(`[AUTOMOD] Enabled for ${interaction.guild.name}`);
}

async function handleDisable(interaction) {
    const cfg = await getGuildData('automod', interaction.guild.id);
    cfg.enabled = false;
    await setGuildData('automod', interaction.guild.id, cfg);
    
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('[SUCCESS] Automod Disabled')
        .setDescription('Automatic moderation is now **disabled** for this server.')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    logger.info(`[AUTOMOD] Disabled for ${interaction.guild.name}`);
}

async function handleStatus(interaction) {
    const cfg = await getAutomodConfig(interaction.guild.id);
    
    const embed = new EmbedBuilder()
        .setColor(cfg.enabled ? '#00FF00' : '#FF0000')
        .setTitle('Automod Configuration')
        .setDescription(`Status: ${cfg.enabled ? '[ON] **Enabled**' : '[OFF] **Disabled**'}`)
        .addFields(
            { name: '[Link] Filter Invites', value: cfg.filterInvites ? 'Yes' : 'No', inline: true },
            { name: '[Web] Filter Links', value: cfg.filterLinks ? 'Yes' : 'No', inline: true },
            { name: '[Shield] Filter Phishing Links', value: cfg.filterPhishingLinks ? 'Yes' : 'No', inline: true },
            { name: '[Shield] Raid Detection', value: cfg.raidDetection ? 'Enabled' : 'Disabled', inline: true },
            { name: '[Mention] Max Mentions', value: `${cfg.maxMentions}`, inline: true },
            { name: '[Caps] Max Caps %', value: `${cfg.maxCapsPercent}%`, inline: true },
            { name: '[Date] Min Account Age', value: cfg.minAccountAge > 0 ? `${cfg.minAccountAge} days` : 'Disabled', inline: true },
            { name: '[Spam] Spam Threshold', value: `${cfg.spamThreshold} msgs / ${cfg.spamInterval / 1000}s`, inline: true },
            { name: '[Ban] Banned Words', value: cfg.bannedWords.length > 0 ? `${cfg.bannedWords.length} word(s)` : 'None configured', inline: true },
            { name: '[Channel] Exempt Channels', value: `${cfg.exemptChannels.length} channel(s)`, inline: true },
            { name: '[Roles] Exempt Roles', value: `${cfg.exemptRoles.length} role(s)`, inline: true },
            { name: '[AI] Moderation', value: cfg.aiModeration ? 'Enabled' : 'Disabled', inline: true },
            { name: '[NSFW] Filter', value: cfg.nsfwFilter ? 'Enabled' : 'Disabled', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Use /automod set to modify settings' });
    
    await interaction.reply({ embeds: [embed] });
}

async function handleAddWord(interaction) {
    const word = interaction.options.getString('word').toLowerCase();
    const guildConfig = await getGuildData('automod', interaction.guild.id);
    
    if (!guildConfig.bannedWords) {
        guildConfig.bannedWords = [];
    }
    
    if (guildConfig.bannedWords.includes(word)) {
        return interaction.reply({
            embeds: [{
                color: 0xFFFF00,
                title: '[INFO] Word Already Banned',
                description: `The word \`${word}\` is already in the banned list.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    guildConfig.bannedWords.push(word);
    await setGuildData('automod', interaction.guild.id, guildConfig);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Word Added')
        .setDescription(`Added \`${word}\` to the banned words list.`)
        .addFields({ name: 'Total Banned Words', value: `${guildConfig.bannedWords.length}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info(`[AUTOMOD] Added banned word in ${interaction.guild.name}`);
}

async function handleRemoveWord(interaction) {
    const word = interaction.options.getString('word').toLowerCase();
    const guildConfig = await getGuildData('automod', interaction.guild.id);
    
    if (!guildConfig.bannedWords || !guildConfig.bannedWords.includes(word)) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Word Not Found',
                description: `The word \`${word}\` is not in the banned list.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    guildConfig.bannedWords = guildConfig.bannedWords.filter(w => w !== word);
    await setGuildData('automod', interaction.guild.id, guildConfig);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Word Removed')
        .setDescription(`Removed \`${word}\` from the banned words list.`)
        .addFields({ name: 'Total Banned Words', value: `${guildConfig.bannedWords.length}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info(`[AUTOMOD] Removed banned word in ${interaction.guild.name}`);
}

async function handleListWords(interaction) {
    const cfg = await getAutomodConfig(interaction.guild.id);
    
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
        if (w.length <= 2) {return '\\*'.repeat(w.length);}
        return w[0] + '\\*'.repeat(w.length - 2) + w[w.length - 1];
    });
    
    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Banned Words List')
        .setDescription(`**${cfg.bannedWords.length}** word(s) banned:\n\n${censoredWords.join(', ')}`)
        .setTimestamp()
        .setFooter({ text: 'Words are partially censored for safety' });
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSet(interaction) {
    const setting = interaction.options.getString('setting');
    const valueStr = interaction.options.getString('value');
    
    // Parse value based on setting type
    let value;
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
                    title: '[ERROR] Invalid Value',
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
                    title: '[ERROR] Invalid Value',
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
    }
    
    const cfg = await getGuildData('automod', interaction.guild.id);
    cfg[setting] = value;
    await setGuildData('automod', interaction.guild.id, cfg);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Setting Updated')
        .setDescription(`**${setting}** has been set to **${value}**.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    logger.info(`[AUTOMOD] Set ${setting}=${value} in ${interaction.guild.name}`);
}

async function handleExemptChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    const action = interaction.options.getString('action');
    
    const guildConfig = await getGuildData('automod', interaction.guild.id);
    if (!guildConfig.exemptChannels) {
        guildConfig.exemptChannels = [];
    }
    
    if (action === 'add') {
        if (guildConfig.exemptChannels.includes(channel.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: '[INFO] Already Exempt',
                    description: `${channel} is already exempt from automod.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }
        
        guildConfig.exemptChannels.push(channel.id);
        await setGuildData('automod', interaction.guild.id, guildConfig);
        
        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] Channel Exempted',
                description: `${channel} is now exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    } else {
        if (!guildConfig.exemptChannels.includes(channel.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: '[INFO] Not Exempt',
                    description: `${channel} is not currently exempt.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }
        
        guildConfig.exemptChannels = guildConfig.exemptChannels.filter(id => id !== channel.id);
        await setGuildData('automod', interaction.guild.id, guildConfig);
        
        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] Exemption Removed',
                description: `${channel} is no longer exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    }
}

async function handleExemptRole(interaction) {
    const role = interaction.options.getRole('role');
    const action = interaction.options.getString('action');
    
    const guildConfig = await getGuildData('automod', interaction.guild.id);
    if (!guildConfig.exemptRoles) {
        guildConfig.exemptRoles = [];
    }
    
    if (action === 'add') {
        if (guildConfig.exemptRoles.includes(role.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: '[INFO] Already Exempt',
                    description: `${role} is already exempt from automod.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }
        
        guildConfig.exemptRoles.push(role.id);
        await setGuildData('automod', interaction.guild.id, guildConfig);
        
        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] Role Exempted',
                description: `${role} is now exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    } else {
        if (!guildConfig.exemptRoles.includes(role.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: '[INFO] Not Exempt',
                    description: `${role} is not currently exempt.`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }
        
        guildConfig.exemptRoles = guildConfig.exemptRoles.filter(id => id !== role.id);
        await setGuildData('automod', interaction.guild.id, guildConfig);
        
        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] Exemption Removed',
                description: `${role} is no longer exempt from automod.`,
                timestamp: new Date().toISOString()
            }]
        });
    }
}

async function handleScan(interaction) {
    try {
        const channel = interaction.options.getChannel('channel');
        const limit = interaction.options.getInteger('limit') || 100;
        const user = interaction.options.getUser('user');
        const deleteEnabled = interaction.options.getBoolean('delete') || false;

        // Check if NSFW filter is enabled for this guild
        const cfg = await getAutomodConfig(interaction.guild.id);
        if (!cfg.nsfwFilter) {
            return interaction.reply({ content: 'NSFW filter is disabled for this server.', flags: MessageFlags.Ephemeral });
        }

        // Validate channel is text-based and in guild
        if (!channel.isTextBased() || !channel.guild) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Channel',
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
                    title: '[ERROR] Permission Denied',
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
            if (messages.size === 0) {break;}

            for (const [, msg] of messages) {
                // Skip if user filter is set and doesn't match
                if (user && msg.author.id !== user.id) {continue;}
                // Check if channel is exempt
                if (cfg.exemptChannels?.includes(msg.channel.id)) {continue;}
                // Check if any of the member's roles are exempt
                if (cfg.exemptRoles?.some(r => msg.member?.roles.cache.has(r))) {continue;}

                // Check message attachments for NSFW
                const result = await checkMessageAttachments(interaction.guild.id, msg);
                messagesScanned++;

                if (result) {
                    nsfwFound++;
                    if (deleteEnabled && result.shouldDelete) {
                        // Check if bot has permission to delete messages in this channel
                        if (channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageMessages)) {
                            try {
                                await msg.delete();
                                messagesDeleted++;
                            } catch (delError) {
                                logger.error(`[ERROR] Failed to delete NSFW message ${msg.id}:`, delError);
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
                            title: '[INFO] NSFW Scan Progress',
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

                if (messagesScanned >= limit) {break;}
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
            .setTitle('[INFO] NSFW Scan Complete')
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
        logger.info(`[AUTOMOD] NSFW scan completed in ${channel.name} for ${interaction.guild.name}`);

    } catch (error) {
        await interaction.editReply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Scan Failed',
                description: 'An error occurred during the NSFW scan.',
                fields: [{ name: 'Error', value: safeError(error) }],
                timestamp: new Date().toISOString()
            }]
        });
        logger.error('[ERROR] NSFW scan error:', error);
    }
}
