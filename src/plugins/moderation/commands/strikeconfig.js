// Strike Config Command
import { logger } from '../../../utils/logger.js';
import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'strikeconfig',
    description: 'Configure strike system settings',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'action',
            description: 'Configuration action',
            type: 3,
            required: true,
            choices: [
                { name: 'View Settings', value: 'view' },
                { name: 'Set Ban Threshold', value: 'ban_threshold' },
                { name: 'Set Kick Threshold', value: 'kick_threshold' },
                { name: 'Toggle Auto-Kick', value: 'auto_kick' }
            ]
        },
        {
            name: 'value',
            description: 'The value to set (for threshold settings)',
            type: 4,
            required: false,
            min_value: 1,
            max_value: 10
        }
    ],
    
    async execute(interaction) {
        try {
            const action = interaction.options.getString('action');
            const value = interaction.options.getInteger('value');
            
            const guildSettings = await getGuildData('strike-config', interaction.guild.id);
            
            if (action === 'view') {
                const banThreshold = guildSettings.banThreshold || 3;
                const kickThreshold = guildSettings.kickThreshold || 2;
                const autoKick = guildSettings.autoKick ?? true;
                
                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Strike System Configuration')
                    .setDescription('Current strike system settings for this server')
                    .addFields(
                        { name: 'Ban Threshold', value: `${banThreshold} strikes`, inline: true },
                        { name: 'Kick Threshold', value: `${kickThreshold} strikes`, inline: true },
                        { name: 'Auto-Kick Enabled', value: autoKick ? 'Yes' : 'No', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Use /strikeconfig to modify settings' });
                
                await interaction.reply({ embeds: [embed] });
                
            } else if (action === 'ban_threshold') {
                if (!value) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Missing Value',
                            description: 'Please provide a value for the ban threshold.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                guildSettings.banThreshold = value;
                await setGuildData('strike-config', interaction.guild.id, guildSettings);
                
                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: '[SUCCESS] Setting Updated',
                        description: `Ban threshold set to **${value}** strikes.`,
                        timestamp: new Date().toISOString()
                    }]
                });
                
                logger.info(`[CONFIG] Ban threshold set to ${value} in ${interaction.guild.name}`);
                
            } else if (action === 'kick_threshold') {
                if (!value) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Missing Value',
                            description: 'Please provide a value for the kick threshold.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                guildSettings.kickThreshold = value;
                await setGuildData('strike-config', interaction.guild.id, guildSettings);
                
                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: '[SUCCESS] Setting Updated',
                        description: `Kick threshold set to **${value}** strikes.`,
                        timestamp: new Date().toISOString()
                    }]
                });
                
                logger.info(`[CONFIG] Kick threshold set to ${value} in ${interaction.guild.name}`);
                
            } else if (action === 'auto_kick') {
                const currentState = guildSettings.autoKick ?? true;
                const newState = !currentState;
                
                guildSettings.autoKick = newState;
                await setGuildData('strike-config', interaction.guild.id, guildSettings);
                
                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: '[SUCCESS] Setting Updated',
                        description: `Auto-kick is now **${newState ? 'enabled' : 'disabled'}**.`,
                        timestamp: new Date().toISOString()
                    }]
                });
                
                logger.info(`[CONFIG] Auto-kick ${newState ? 'enabled' : 'disabled'} in ${interaction.guild.name}`);
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};