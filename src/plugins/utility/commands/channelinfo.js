import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
// Channelinfo Command
// Display detailed information about a channel

export default {
    name: 'channelinfo',
    description: 'Display detailed information about a channel',
    category: 'Utility',
    
    dmPermission: false,
    options: [
        {
            name: 'channel',
            description: 'The channel to get information about',
            type: 7, // CHANNEL type
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            
            // Determine channel type
            const channelTypes = {
                0: 'Text Channel',
                1: 'DM',
                2: 'Voice Channel',
                3: 'Group DM',
                4: 'Category',
                5: 'News Channel',
                10: 'News Thread',
                11: 'Public Thread',
                12: 'Private Thread',
                13: 'Stage Channel',
                14: 'Directory',
                15: 'Forum'
            };
            
            const typeName = channelTypes[channel.type] || 'Unknown';
            
            // Get basic info
            const channelInfo = [
                {
                    name: '[INFO] Type',
                    value: typeName,
                    inline: true
                },
                {
                    name: '[INFO] ID',
                    value: channel.id,
                    inline: true
                }
            ];
            
            // Add topic for text channels
            if (channel.topic) {
                channelInfo.push({
                    name: '[INFO] Topic',
                    value: channel.topic.substring(0, 1024),
                    inline: false
                });
            }
            
            // Add slowmode for text channels
            if (channel.rateLimitPerUser && channel.rateLimitPerUser > 0) {
                channelInfo.push({
                    name: '[INFO] Slowmode',
                    value: `${channel.rateLimitPerUser} second(s)`,
                    inline: true
                });
            }
            
            // Add bitrate for voice channels
            if (channel.bitrate) {
                channelInfo.push({
                    name: '[INFO] Bitrate',
                    value: `${Math.floor(channel.bitrate / 1000)}kbps`,
                    inline: true
                });
            }
            
            // Add user limit for voice channels
            if (channel.userLimit && channel.userLimit > 0) {
                channelInfo.push({
                    name: '[INFO] User Limit',
                    value: `${channel.userLimit}`,
                    inline: true
                });
            }
            
            // Add video quality for stage/voice
            if (channel.videoQualityMode) {
                const quality = channel.videoQualityMode === 1 ? 'Auto' : '720p';
                channelInfo.push({
                    name: '[INFO] Video Quality',
                    value: quality,
                    inline: true
                });
            }
            
            // Add nsfw status for text channels
            if (channel.isTextBased() && !channel.isThread()) {
                channelInfo.push({
                    name: '[INFO] NSFW',
                    value: channel.nsfw ? 'Yes' : 'No',
                    inline: true
                });
            }
            
            // Add creation date
            channelInfo.push({
                name: '[INFO] Created',
                value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`,
                inline: true
            });
            
            // Add position
            channelInfo.push({
                name: '[INFO] Position',
                value: `${channel.rawPosition + 1}`,
                inline: true
            });
            
            // Create channel info embed
            const channelEmbed = {
                color: 0x3498DB,
                title: `[CHANNEL] ${channel.name}`,
                fields: channelInfo,
                timestamp: new Date().toISOString()
            };
            
            // Add icon or category
            if (channel.parent) {
                channelEmbed.fields.push({
                    name: '[INFO] Category',
                    value: channel.parent.name,
                    inline: true
                });
            }
            
            await interaction.reply({ embeds: [channelEmbed] });
            
        } catch (error) {
            console.error('[ERROR] Channelinfo command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while getting channel information.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
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
