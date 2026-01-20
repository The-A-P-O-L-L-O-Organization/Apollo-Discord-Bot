// Automod Command
// Configure automatic moderation settings per server

import { PermissionsBitField, EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildData, setGuildData, updateGuildData } from '../utils/dataStore.js';
import { config } from '../config/config.js';

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
            type: 1, // SUB_COMMAND
        },
        {
            name: 'disable',
            description: 'Disable automod for this server',
            type: 1, // SUB_COMMAND
        },
        {
            name: 'status',
            description: 'View current automod configuration',
            type: 1, // SUB_COMMAND
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
            type: 1, // SUB_COMMAND
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
                        { name: 'Max Mentions', value: 'maxMentions' },
                        { name: 'Max Caps Percent', value: 'maxCapsPercent' },
                        { name: 'Min Account Age (days)', value: 'minAccountAge' },
                        { name: 'Spam Threshold', value: 'spamThreshold' },
                        { name: 'Spam Interval (ms)', value: 'spamInterval' }
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
        }
    ],
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
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
            }
        } catch (error) {
            console.error('[ERROR] Automod command error:', error);
            
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: 'An error occurred while configuring automod.',
                    fields: [{ name: 'Error', value: error.message }],
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }
    }
};

function getAutomodConfig(guildId) {
    const guildConfig = getGuildData('automod', guildId);
    return {
        enabled: guildConfig.enabled ?? config.automod.enabled,
        bannedWords: guildConfig.bannedWords || [],
        filterInvites: guildConfig.filterInvites ?? config.automod.filterInvites,
        filterLinks: guildConfig.filterLinks ?? config.automod.filterLinks,
        maxMentions: guildConfig.maxMentions ?? config.automod.maxMentions,
        maxCapsPercent: guildConfig.maxCapsPercent ?? config.automod.maxCapsPercent,
        minAccountAge: guildConfig.minAccountAge ?? config.automod.minAccountAge,
        spamThreshold: guildConfig.spamThreshold ?? config.automod.spamThreshold,
        spamInterval: guildConfig.spamInterval ?? config.automod.spamInterval,
        exemptChannels: guildConfig.exemptChannels || [],
        exemptRoles: guildConfig.exemptRoles || []
    };
}

async function handleEnable(interaction) {
    updateGuildData('automod', interaction.guild.id, 'enabled', true);
    
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
    console.log(`[AUTOMOD] Enabled for ${interaction.guild.name}`);
}

async function handleDisable(interaction) {
    updateGuildData('automod', interaction.guild.id, 'enabled', false);
    
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('[SUCCESS] Automod Disabled')
        .setDescription('Automatic moderation is now **disabled** for this server.')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    console.log(`[AUTOMOD] Disabled for ${interaction.guild.name}`);
}

async function handleStatus(interaction) {
    const cfg = getAutomodConfig(interaction.guild.id);
    
    const embed = new EmbedBuilder()
        .setColor(cfg.enabled ? '#00FF00' : '#FF0000')
        .setTitle('Automod Configuration')
        .setDescription(`Status: ${cfg.enabled ? '✅ **Enabled**' : '❌ **Disabled**'}`)
        .addFields(
            { name: '🔗 Filter Invites', value: cfg.filterInvites ? 'Yes' : 'No', inline: true },
            { name: '🌐 Filter Links', value: cfg.filterLinks ? 'Yes' : 'No', inline: true },
            { name: '📢 Max Mentions', value: `${cfg.maxMentions}`, inline: true },
            { name: '🔠 Max Caps %', value: `${cfg.maxCapsPercent}%`, inline: true },
            { name: '📅 Min Account Age', value: cfg.minAccountAge > 0 ? `${cfg.minAccountAge} days` : 'Disabled', inline: true },
            { name: '📨 Spam Threshold', value: `${cfg.spamThreshold} msgs / ${cfg.spamInterval / 1000}s`, inline: true },
            { name: '🚫 Banned Words', value: `${cfg.bannedWords.length} word(s)`, inline: true },
            { name: '📝 Exempt Channels', value: `${cfg.exemptChannels.length} channel(s)`, inline: true },
            { name: '👥 Exempt Roles', value: `${cfg.exemptRoles.length} role(s)`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Use /automod set to modify settings' });
    
    await interaction.reply({ embeds: [embed] });
}

async function handleAddWord(interaction) {
    const word = interaction.options.getString('word').toLowerCase();
    const guildConfig = getGuildData('automod', interaction.guild.id);
    
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
            ephemeral: true
        });
    }
    
    guildConfig.bannedWords.push(word);
    setGuildData('automod', interaction.guild.id, guildConfig);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Word Added')
        .setDescription(`Added \`${word}\` to the banned words list.`)
        .addFields({ name: 'Total Banned Words', value: `${guildConfig.bannedWords.length}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`[AUTOMOD] Added banned word in ${interaction.guild.name}`);
}

async function handleRemoveWord(interaction) {
    const word = interaction.options.getString('word').toLowerCase();
    const guildConfig = getGuildData('automod', interaction.guild.id);
    
    if (!guildConfig.bannedWords || !guildConfig.bannedWords.includes(word)) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Word Not Found',
                description: `The word \`${word}\` is not in the banned list.`,
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    guildConfig.bannedWords = guildConfig.bannedWords.filter(w => w !== word);
    setGuildData('automod', interaction.guild.id, guildConfig);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Word Removed')
        .setDescription(`Removed \`${word}\` from the banned words list.`)
        .addFields({ name: 'Total Banned Words', value: `${guildConfig.bannedWords.length}` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`[AUTOMOD] Removed banned word in ${interaction.guild.name}`);
}

async function handleListWords(interaction) {
    const cfg = getAutomodConfig(interaction.guild.id);
    
    if (cfg.bannedWords.length === 0) {
        return interaction.reply({
            embeds: [{
                color: 0xFFFF00,
                title: 'Banned Words List',
                description: 'No banned words configured.\n\nUse `/automod addword <word>` to add words.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Censor the words partially for display
    const censoredWords = cfg.bannedWords.map(w => {
        if (w.length <= 2) return '\\*'.repeat(w.length);
        return w[0] + '\\*'.repeat(w.length - 2) + w[w.length - 1];
    });
    
    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Banned Words List')
        .setDescription(`**${cfg.bannedWords.length}** word(s) banned:\n\n${censoredWords.join(', ')}`)
        .setTimestamp()
        .setFooter({ text: 'Words are partially censored for safety' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSet(interaction) {
    const setting = interaction.options.getString('setting');
    const valueStr = interaction.options.getString('value');
    
    // Parse value based on setting type
    let value;
    const booleanSettings = ['filterInvites', 'filterLinks'];
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
                ephemeral: true
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
                ephemeral: true
            });
        }
        
        // Validate positive numbers for numeric settings (except maxCapsPercent which can be 0)
        if (setting !== 'maxCapsPercent' && value <= 0) {
            return interaction.reply({
                content: `${setting} must be a positive number greater than zero.`,
                ephemeral: true
            });
        }
    }
    
    updateGuildData('automod', interaction.guild.id, setting, value);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Setting Updated')
        .setDescription(`**${setting}** has been set to **${value}**.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    console.log(`[AUTOMOD] Set ${setting}=${value} in ${interaction.guild.name}`);
}

async function handleExemptChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    const action = interaction.options.getString('action');
    
    const guildConfig = getGuildData('automod', interaction.guild.id);
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
                ephemeral: true
            });
        }
        
        guildConfig.exemptChannels.push(channel.id);
        setGuildData('automod', interaction.guild.id, guildConfig);
        
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
                ephemeral: true
            });
        }
        
        guildConfig.exemptChannels = guildConfig.exemptChannels.filter(id => id !== channel.id);
        setGuildData('automod', interaction.guild.id, guildConfig);
        
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
    
    const guildConfig = getGuildData('automod', interaction.guild.id);
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
                ephemeral: true
            });
        }
        
        guildConfig.exemptRoles.push(role.id);
        setGuildData('automod', interaction.guild.id, guildConfig);
        
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
                ephemeral: true
            });
        }
        
        guildConfig.exemptRoles = guildConfig.exemptRoles.filter(id => id !== role.id);
        setGuildData('automod', interaction.guild.id, guildConfig);
        
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
