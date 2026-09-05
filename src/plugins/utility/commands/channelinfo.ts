import { ChatInputCommandInteraction, ChannelType, EmbedBuilder, MessageFlags, GuildChannel, TextChannel, VoiceChannel, StageChannel, ForumChannel, NewsChannel, CategoryChannel, ThreadChannel } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

function isGuildChannel(channel: unknown): channel is GuildChannel {
    return channel instanceof GuildChannel;
}

function isTextChannel(channel: unknown): channel is TextChannel {
    return channel instanceof TextChannel;
}

function isVoiceChannel(channel: unknown): channel is VoiceChannel {
    return channel instanceof VoiceChannel;
}

function isStageChannel(channel: unknown): channel is StageChannel {
    return channel instanceof StageChannel;
}

function isForumChannel(channel: unknown): channel is ForumChannel {
    return channel instanceof ForumChannel;
}

function isNewsChannel(channel: unknown): channel is NewsChannel {
    return channel instanceof NewsChannel;
}

function isCategoryChannel(channel: unknown): channel is CategoryChannel {
    return channel instanceof CategoryChannel;
}

function isThreadChannel(channel: unknown): channel is ThreadChannel {
    return channel instanceof ThreadChannel;
}

export default {
    // Channelinfo Command
    // Display detailed information about a channel
    name: 'channelinfo',
    description: 'Display detailed information about a channel',
    category: 'utility',
    dmPermission: false,
    options: [
        {
            name: 'channel',
            description: 'The channel to get information about',
            type: 7, // CHANNEL type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const channel = interaction.options.getChannel('channel') ?? interaction.channel;

            if (!channel) {
                await interaction.reply({ content: 'Could not find that channel.', flags: MessageFlags.Ephemeral });
                return;
            }

            // Since dmPermission is false, this should always be a guild channel
            // Type assertion for guild channel properties
            const gChannel = channel as GuildChannel & { createdTimestamp: number; name: string; rawPosition: number; parent?: CategoryChannel | null };

            // Determine channel type
            const channelTypes: Record<number, string> = {
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

            const typeName = channelTypes[channel.type] ?? 'Unknown';

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
            if (isTextChannel(channel) && channel.topic) {
                channelInfo.push({
                    name: '[INFO] Topic',
                    value: channel.topic.substring(0, 1024),
                    inline: false
                });
            }

            // Add slowmode for text channels
            if (isTextChannel(channel) && channel.rateLimitPerUser && channel.rateLimitPerUser > 0) {
                channelInfo.push({
                    name: '[INFO] Slowmode',
                    value: `${channel.rateLimitPerUser} second(s)`,
                    inline: true
                });
            }

            // Add bitrate for voice channels
            if ((isVoiceChannel(channel) || isStageChannel(channel)) && channel.bitrate) {
                channelInfo.push({
                    name: '[INFO] Bitrate',
                    value: `${Math.floor(channel.bitrate / 1000)}kbps`,
                    inline: true
                });
            }

            // Add user limit for voice channels
            if (isVoiceChannel(channel) && channel.userLimit && channel.userLimit > 0) {
                channelInfo.push({
                    name: '[INFO] User Limit',
                    value: `${channel.userLimit}`,
                    inline: true
                });
            }

            // Add video quality for stage/voice
            if ((isVoiceChannel(channel) || isStageChannel(channel)) && channel.videoQualityMode) {
                const quality = channel.videoQualityMode === 1 ? 'Auto' : '720p';
                channelInfo.push({
                    name: '[INFO] Video Quality',
                    value: quality,
                    inline: true
                });
            }

            // Add nsfw status for text channels
            if (isTextChannel(channel) && !isThreadChannel(channel)) {
                channelInfo.push({
                    name: '[INFO] NSFW',
                    value: channel.nsfw ? 'Yes' : 'No',
                    inline: true
                });
            }

            // Add creation date
            channelInfo.push({
                name: '[INFO] Created',
                value: `<t:${Math.floor(gChannel.createdTimestamp / 1000)}:F>`,
                inline: true
            });

            // Add position (guild channels only)
            channelInfo.push({
                name: '[INFO] Position',
                value: `${gChannel.rawPosition + 1}`,
                inline: true
            });

            // Create channel info embed
            const channelEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`[CHANNEL] ${gChannel.name}`)
                .addFields(channelInfo)
                .setTimestamp();

            // Add category if available
            if ('parent' in gChannel && gChannel.parent) {
                channelEmbed.addFields({
                    name: '[INFO] Category',
                    value: gChannel.parent.name,
                    inline: true
                });
            }

            await interaction.reply({ embeds: [channelEmbed] });
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