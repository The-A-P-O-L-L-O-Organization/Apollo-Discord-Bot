// Slowmode Command
// Sets channel slowmode programmatically

import { PermissionsBitField } from 'discord.js';
import { sendModLog } from '../../../utils/modLog.js';

export default {
    name: 'slowmode',
    description: 'Set channel slowmode (rate limit)',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        {
            name: 'duration',
            description: 'Slowmode duration in seconds (0-21600, 0 to disable)',
            type: 4, // INTEGER type
            required: true,
            min_value: 0,
            max_value: 21600 // 6 hours max
        },
        {
            name: 'channel',
            description: 'The channel to set slowmode on (defaults to current channel)',
            type: 7, // CHANNEL type
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for setting slowmode',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            // Get options
            const duration = interaction.options.getInteger('duration');
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if the channel is a text-based channel
            if (!channel.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Channel',
                    description: 'You can only set slowmode on text-based channels.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Validate duration
            if (duration < 0 || duration > 21600) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Duration',
                    description: 'Slowmode duration must be between 0 and 21600 seconds (6 hours).',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Get current slowmode
            const previousSlowmode = channel.rateLimitPerUser;
            
            // Set slowmode
            await channel.setRateLimitPerUser(duration, 
                `Slowmode set by ${interaction.user.tag}: ${reason}`);
            
            // Format duration text
            let durationText;
            if (duration === 0) {
                durationText = 'Disabled';
            } else if (duration < 60) {
                durationText = `${duration} second(s)`;
            } else if (duration < 3600) {
                durationText = `${Math.floor(duration / 60)} minute(s)`;
            } else {
                durationText = `${Math.floor(duration / 3600)} hour(s)`;
            }
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: duration === 0 ? '[SUCCESS] Slowmode Disabled' : '[SUCCESS] Slowmode Enabled',
                description: `Slowmode has been ${duration === 0 ? 'disabled' : 'set'} for ${channel}.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Duration',
                        value: durationText,
                        inline: true
                    },
                    {
                        name: '[INFO] Previous',
                        value: previousSlowmode === 0 ? 'Disabled' : `${previousSlowmode}s`,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send notification to the channel if it's not the current channel
            if (channel.id !== interaction.channel.id) {
                try {
                    const slowmodeNotice = {
                        color: duration === 0 ? 0x00FF00 : 0xFFFF00,
                        title: duration === 0 ? '[SLOWMODE] Disabled' : '[SLOWMODE] Enabled',
                        description: duration === 0 ? 
                            'Slowmode has been disabled for this channel.' :
                            `Slowmode has been enabled. Members must wait ${durationText} between messages.`,
                        fields: [
                            {
                                name: '[INFO] Reason',
                                value: reason,
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString()
                    };
                    await channel.send({ embeds: [slowmodeNotice] });
                } catch (err) {
                    console.log('[WARNING] Could not send slowmode notice to channel:', err.message);
                }
            }
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'slowmode',
                target: { tag: `#${channel.name}`, id: channel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `<#${channel.id}>`,
                    'Duration': durationText,
                    'Previous': previousSlowmode === 0 ? 'Disabled' : `${previousSlowmode}s`
                }
            });
            
            // Log the action
            console.log(`[MODERATION] Slowmode ${duration === 0 ? 'disabled' : 'set to ' + duration + 's'} for channel ${channel.name} by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Slowmode command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to set slowmode.',
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
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
