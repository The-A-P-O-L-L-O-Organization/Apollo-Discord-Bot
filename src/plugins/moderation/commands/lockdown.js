// Lockdown Command
export default {
// Locks channels during raids by preventing @everyone from sending messages
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

    name: 'lockdown',
    description: 'Lock a channel to prevent @everyone from sending messages',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        {
            name: 'channel',
            description: 'The channel to lock (defaults to current channel)',
            type: 7, // CHANNEL type
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for the lockdown',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            // Get the channel to lock
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if the channel is a text-based channel
            if (!channel.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Channel',
                    description: 'You can only lock text-based channels.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Get the @everyone role
            const everyoneRole = interaction.guild.roles.everyone;
            
            // Get current permissions for @everyone in this channel
            const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);
            
            // Check if channel is already locked
            const lockdownData = await getGuildData('channel-lockdowns', interaction.guild.id);
            if (lockdownData[channel.id]) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Channel Already Locked',
                    description: `${channel} is already in lockdown mode.`,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Store original permissions before locking
            const originalPermissions = currentPermissions ? {
                SendMessages: currentPermissions.allow.has(PermissionsBitField.Flags.SendMessages) ? true : 
                    currentPermissions.deny.has(PermissionsBitField.Flags.SendMessages) ? false : null,
                AddReactions: currentPermissions.allow.has(PermissionsBitField.Flags.AddReactions) ? true :
                    currentPermissions.deny.has(PermissionsBitField.Flags.AddReactions) ? false : null
            } : {
                SendMessages: null,
                AddReactions: null
            };
            
            // Lock the channel
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false,
                AddReactions: false
            }, { reason: `Lockdown by ${interaction.user.tag}: ${reason}` });
            
            // Save lockdown info to database
            lockdownData[channel.id] = {
                channelId: channel.id,
                originalPermissions: originalPermissions,
                lockedBy: interaction.user.id,
                lockedByTag: interaction.user.tag,
                lockedAt: Date.now(),
                reason: reason
            };
            await setGuildData('channel-lockdowns', interaction.guild.id, lockdownData);
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] Channel Locked',
                description: `${channel} has been locked down.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: true
                    },
                    {
                        name: '[INFO] Channel ID',
                        value: channel.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send notification to the locked channel
            try {
                const lockNotice = {
                    color: 0xFF0000,
                    title: '[LOCKDOWN] Channel Locked',
                    description: 'This channel has been locked by a moderator. You cannot send messages or add reactions.',
                    fields: [
                        {
                            name: '[INFO] Reason',
                            value: reason,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                await channel.send({ embeds: [lockNotice] });
            } catch (err) {
                logger.info('[WARNING] Could not send lock notice to channel:', err.message);
            }
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'lockdown',
                target: { tag: `#${channel.name}`, id: channel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `<#${channel.id}>`
                }
            });
            
            // Log the action
            logger.info(`[MODERATION] Channel ${channel.name} was locked by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            logger.error('[ERROR] Lockdown command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to lock the channel.',
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
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
