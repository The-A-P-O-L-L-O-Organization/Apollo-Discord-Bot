// Unlock Command
// Unlocks previously locked channels and restores original permissions
import { logger } from './utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
import { logger } from '../../../utils/logger.js';
    name: 'unlock',
    description: 'Unlock a previously locked channel',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        {
            name: 'channel',
            description: 'The channel to unlock (defaults to current channel)',
            type: 7, // CHANNEL type
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for unlocking',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            // Get the channel to unlock
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if the channel is a text-based channel
            if (!channel.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Channel',
                    description: 'You can only unlock text-based channels.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Get lockdown data
            const lockdownData = await getGuildData('channel-lockdowns', interaction.guild.id);
            const lockInfo = lockdownData[channel.id];
            
            // Check if channel is actually locked
            if (!lockInfo) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Channel Not Locked',
                    description: `${channel} is not currently in lockdown mode.`,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Get the @everyone role
            const everyoneRole = interaction.guild.roles.everyone;
            
            // Restore original permissions
            const restorePermissions = {};
            if (lockInfo.originalPermissions.SendMessages !== null) {
                restorePermissions.SendMessages = lockInfo.originalPermissions.SendMessages;
            }
            if (lockInfo.originalPermissions.AddReactions !== null) {
                restorePermissions.AddReactions = lockInfo.originalPermissions.AddReactions;
            }
            
            // If original permissions were null (not set), remove the overrides
            if (Object.keys(restorePermissions).length === 0) {
                // Remove the permission overrides to restore to default
                await channel.permissionOverwrites.delete(everyoneRole, 
                    { reason: `Unlock by ${interaction.user.tag}: ${reason}` });
            } else {
                await channel.permissionOverwrites.edit(everyoneRole, restorePermissions,
                    { reason: `Unlock by ${interaction.user.tag}: ${reason}` });
            }
            
            // Remove from database
            delete lockdownData[channel.id];
            await setGuildData('channel-lockdowns', interaction.guild.id, lockdownData);
            
            // Calculate lockdown duration
            const duration = Date.now() - lockInfo.lockedAt;
            const durationMinutes = Math.floor(duration / 60000);
            const durationText = durationMinutes < 1 ? 'Less than 1 minute' : 
                durationMinutes === 1 ? '1 minute' : 
                    `${durationMinutes} minutes`;
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] Channel Unlocked',
                description: `${channel} has been unlocked.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Locked By',
                        value: lockInfo.lockedByTag,
                        inline: true
                    },
                    {
                        name: '[INFO] Duration',
                        value: durationText,
                        inline: true
                    },
                    {
                        name: '[INFO] Unlock Reason',
                        value: reason,
                        inline: false
                    },
                    {
                        name: '[INFO] Original Lockdown Reason',
                        value: lockInfo.reason,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send notification to the unlocked channel
            try {
                const unlockNotice = {
                    color: 0x00FF00,
                    title: '[LOCKDOWN LIFTED] Channel Unlocked',
                    description: 'This channel has been unlocked. You can now send messages and add reactions.',
                    fields: [
                        {
                            name: '[INFO] Reason',
                            value: reason,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                await channel.send({ embeds: [unlockNotice] });
            } catch (err) {
                logger.info('[WARNING] Could not send unlock notice to channel:', err.message);
            }
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'unlock',
                target: { tag: `#${channel.name}`, id: channel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `<#${channel.id}>`,
                    'Duration': durationText
                }
            });
            
            // Log the action
            logger.info(`[MODERATION] Channel ${channel.name} was unlocked by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            logger.error('[ERROR] Unlock command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to unlock the channel.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
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
