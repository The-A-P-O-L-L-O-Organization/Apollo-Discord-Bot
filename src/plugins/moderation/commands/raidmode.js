// Raidmode Command
export default {
// Manually enable/disable raid mode lockdown
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { enableRaidMode, disableRaidMode, isRaidModeEnabled } from '../../../utils/raidDetection.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

    name: 'raidmode',
    description: 'Enable or disable raid mode (locks all channels)',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'action',
            description: 'Enable or disable raid mode',
            type: 3, // STRING
            required: true,
            choices: [
                { name: 'Enable', value: 'enable' },
                { name: 'Disable', value: 'disable' },
                { name: 'Status', value: 'status' }
            ]
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const action = interaction.options.getString('action');
            
            if (action === 'status') {
                // Check raid mode status
                const isEnabled = isRaidModeEnabled(interaction.guild.id);
                
                const embed = new EmbedBuilder()
                    .setColor(isEnabled ? '#FF0000' : '#00FF00')
                    .setTitle('Raid Mode Status')
                    .setDescription(`Raid mode is currently **${isEnabled ? 'ENABLED' : 'DISABLED'}**`)
                    .setTimestamp();
                
                if (isEnabled) {
                    embed.addFields({
                        name: 'Note',
                        value: 'All channels are locked. Use `/raidmode disable` to unlock.',
                        inline: false
                    });
                }
                
                await interaction.reply({ embeds: [embed] });
                
            } else if (action === 'enable') {
                await interaction.deferReply();
                
                // Enable raid mode
                const result = await enableRaidMode(interaction.guild);
                
                if (!result.success) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Already Enabled',
                            description: result.reason,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('[!] Raid Mode ENABLED')
                    .setDescription('🔒 All channels have been locked to prevent raid damage.')
                    .addFields(
                        { name: 'Channels Locked', value: `${result.locked}`, inline: true },
                        { name: 'Failed', value: `${result.failed}`, inline: true },
                        { name: 'Total Channels', value: `${result.total}`, inline: true }
                    )
                    .addFields({
                        name: 'Next Steps',
                        value: '• Review recent member joins\n• Ban raiders manually\n• Use `/raidmode disable` when clear',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: `Activated by ${interaction.user.tag}` });
                
                await interaction.editReply({ embeds: [embed] });
                
                logger.info(`[RAID] Raid mode enabled by ${interaction.user.tag} in ${interaction.guild.name}`);
                
            } else if (action === 'disable') {
                await interaction.deferReply();
                
                // Disable raid mode
                const result = await disableRaidMode(interaction.guild);
                
                if (!result.success) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Not Enabled',
                            description: result.reason,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('[SUCCESS] Raid Mode DISABLED')
                    .setDescription('🔓 All channels have been unlocked.')
                    .addFields(
                        { name: 'Channels Unlocked', value: `${result.unlocked}`, inline: true },
                        { name: 'Failed', value: `${result.failed}`, inline: true },
                        { name: 'Total Channels', value: `${result.total}`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Deactivated by ${interaction.user.tag}` });
                
                await interaction.editReply({ embeds: [embed] });
                
                logger.info(`[RAID] Raid mode disabled by ${interaction.user.tag} in ${interaction.guild.name}`);
            }
            
        } catch (error) {
            logger.error('[ERROR] Raidmode command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while changing raid mode.',
                fields: [{ name: 'Error', value: error.message, inline: true }],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
};
