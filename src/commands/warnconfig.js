// Warning Config Command
// Configure warning thresholds per server

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/dataStore.js';
import { config } from '../config/config.js';

export default {
    name: 'warnconfig',
    description: 'Configure warning system thresholds',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'view',
            description: 'View current warning configuration',
            type: 1, // SUB_COMMAND
        },
        {
            name: 'set',
            description: 'Set a warning threshold',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'action',
                    description: 'The punishment action',
                    type: 3, // STRING type
                    required: true,
                    choices: [
                        { name: 'Mute', value: 'mute' },
                        { name: 'Kick', value: 'kick' },
                        { name: 'Ban', value: 'ban' }
                    ]
                },
                {
                    name: 'warnings',
                    description: 'Number of warnings to trigger action (0 to disable)',
                    type: 4, // INTEGER type
                    required: true,
                    min_value: 0,
                    max_value: 100
                }
            ]
        },
        {
            name: 'setmuteduration',
            description: 'Set auto-mute duration',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'duration',
                    description: 'Duration (e.g., 1h, 1d, 1w)',
                    type: 3, // STRING type
                    required: true
                }
            ]
        },
        {
            name: 'reset',
            description: 'Reset to default configuration',
            type: 1, // SUB_COMMAND
        }
    ],
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'view':
                    await handleView(interaction);
                    break;
                case 'set':
                    await handleSet(interaction);
                    break;
                case 'setmuteduration':
                    await handleSetMuteDuration(interaction);
                    break;
                case 'reset':
                    await handleReset(interaction);
                    break;
            }
        } catch (error) {
            console.error('[ERROR] Warn config command error:', error);
            
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: 'An error occurred while configuring warnings.',
                    fields: [{ name: 'Error', value: error.message }],
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }
    }
};

async function handleView(interaction) {
    const guildConfig = getGuildData('warnings-config', interaction.guild.id);
    const thresholds = guildConfig.thresholds || config.warnings.thresholds;
    const muteDuration = guildConfig.muteDuration || config.warnings.muteDuration;
    
    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Warning Configuration')
        .setDescription(`Current warning thresholds for ${interaction.guild.name}`)
        .addFields(
            { 
                name: '🔇 Auto-Mute Threshold', 
                value: thresholds.mute ? `${thresholds.mute} warnings` : 'Disabled', 
                inline: true 
            },
            { 
                name: '👢 Auto-Kick Threshold', 
                value: thresholds.kick ? `${thresholds.kick} warnings` : 'Disabled', 
                inline: true 
            },
            { 
                name: '🔨 Auto-Ban Threshold', 
                value: thresholds.ban ? `${thresholds.ban} warnings` : 'Disabled', 
                inline: true 
            },
            { 
                name: '⏱️ Auto-Mute Duration', 
                value: formatDuration(muteDuration), 
                inline: true 
            }
        )
        .addFields({
            name: 'How it works',
            value: 'When a user reaches the warning threshold, the corresponding punishment is automatically applied.',
            inline: false
        })
        .setTimestamp()
        .setFooter({ text: 'Use /warnconfig set to modify thresholds' });
    
    await interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction) {
    const action = interaction.options.getString('action');
    const warnings = interaction.options.getInteger('warnings');
    
    // Get current config
    const guildConfig = getGuildData('warnings-config', interaction.guild.id);
    
    // Initialize thresholds if not exists
    if (!guildConfig.thresholds) {
        guildConfig.thresholds = { ...config.warnings.thresholds };
    }
    
    // Update threshold
    guildConfig.thresholds[action] = warnings === 0 ? null : warnings;
    
    // Validate thresholds (mute < kick < ban)
    const { mute, kick, ban } = guildConfig.thresholds;
    if (mute && kick && mute >= kick) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Configuration',
                description: 'Mute threshold must be less than kick threshold.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    if (kick && ban && kick >= ban) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Configuration',
                description: 'Kick threshold must be less than ban threshold.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    if (mute && ban && mute >= ban) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Configuration',
                description: 'Mute threshold must be less than ban threshold.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Save config
    setGuildData('warnings-config', interaction.guild.id, guildConfig);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Threshold Updated')
        .setDescription(
            warnings === 0 
                ? `Auto-**${action}** has been **disabled**.`
                : `Auto-**${action}** will now trigger at **${warnings}** warnings.`
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    console.log(`[CONFIG] Warning ${action} threshold set to ${warnings} in ${interaction.guild.name}`);
}

async function handleSetMuteDuration(interaction) {
    const durationStr = interaction.options.getString('duration');
    
    // Parse duration
    const ms = parseDuration(durationStr);
    
    if (!ms) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Duration',
                description: 'Please use a valid duration format: `1m`, `1h`, `1d`, `1w`',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Get current config
    const guildConfig = getGuildData('warnings-config', interaction.guild.id);
    guildConfig.muteDuration = ms;
    
    // Save config
    setGuildData('warnings-config', interaction.guild.id, guildConfig);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Mute Duration Updated')
        .setDescription(`Auto-mute duration set to **${formatDuration(ms)}**.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    console.log(`[CONFIG] Warning mute duration set to ${ms}ms in ${interaction.guild.name}`);
}

async function handleReset(interaction) {
    // Reset to defaults
    setGuildData('warnings-config', interaction.guild.id, {});
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('[SUCCESS] Configuration Reset')
        .setDescription('Warning configuration has been reset to defaults.')
        .addFields(
            { name: 'Auto-Mute', value: `${config.warnings.thresholds.mute} warnings`, inline: true },
            { name: 'Auto-Kick', value: `${config.warnings.thresholds.kick} warnings`, inline: true },
            { name: 'Auto-Ban', value: `${config.warnings.thresholds.ban} warnings`, inline: true },
            { name: 'Mute Duration', value: formatDuration(config.warnings.muteDuration), inline: true }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    console.log(`[CONFIG] Warning config reset in ${interaction.guild.name}`);
}

function parseDuration(str) {
    const match = str.match(/^(\d+)([mhdw])$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        'm': 60000,
        'h': 3600000,
        'd': 86400000,
        'w': 604800000
    };
    
    return value * (multipliers[unit] || 0);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day(s)`;
    if (hours > 0) return `${hours} hour(s)`;
    if (minutes > 0) return `${minutes} minute(s)`;
    return `${seconds} second(s)`;
}
