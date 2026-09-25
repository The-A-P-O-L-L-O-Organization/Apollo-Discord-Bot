import type { ChatInputCommandInteraction, GuildChannel, CategoryChannel} from 'discord.js';
import { EmbedBuilder, MessageFlags, TextChannel, VoiceChannel, StageChannel, ThreadChannel, VideoQualityMode } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

function isTextChannel(channel: unknown): channel is TextChannel {
    return channel instanceof TextChannel;
}

function isVoiceChannel(channel: unknown): channel is VoiceChannel {
    return channel instanceof VoiceChannel;
}

function isStageChannel(channel: unknown): channel is StageChannel {
    return channel instanceof StageChannel;
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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const channel = interaction.options.getChannel('channel') ?? interaction.channel;

            if (!channel) {
                await interaction.reply({ content: t('channelinfo.notFound'), flags: MessageFlags.Ephemeral });
                return;
            }

            // Since dmPermission is false, this should always be a guild channel
            // Type assertion for guild channel properties
            const gChannel = channel as GuildChannel & { createdTimestamp: number; name: string; rawPosition: number; parent?: CategoryChannel | null };

            // Determine channel type
            const channelTypes: Record<number, string> = {
                0: t('channelinfo.text'),
                1: t('channelinfo.dm'),
                2: t('channelinfo.voice'),
                3: t('channelinfo.groupDm'),
                4: t('channelinfo.categoryType'),
                5: t('channelinfo.news'),
                10: t('channelinfo.newsThread'),
                11: t('channelinfo.publicThread'),
                12: t('channelinfo.privateThread'),
                13: t('channelinfo.stage'),
                14: t('channelinfo.directory'),
                15: t('channelinfo.forum')
            };

            const typeName = channelTypes[channel.type] ?? t('channelinfo.unknown');

            // Get basic info
            const channelInfo = [
                {
                    name: t('channelinfo.type'),
                    value: typeName,
                    inline: true
                },
                {
                    name: t('channelinfo.id'),
                    value: channel.id,
                    inline: true
                }
            ];

            // Add topic for text channels
            if (isTextChannel(channel) && channel.topic) {
                channelInfo.push({
                    name: t('channelinfo.topic'),
                    value: channel.topic.substring(0, 1024),
                    inline: false
                });
            }

            // Add slowmode for text channels
            if (isTextChannel(channel) && channel.rateLimitPerUser && channel.rateLimitPerUser > 0) {
                channelInfo.push({
                    name: t('channelinfo.slowmode'),
                    value: t('channelinfo.seconds', { count: channel.rateLimitPerUser }),
                    inline: true
                });
            }

            // Add bitrate for voice channels
            if ((isVoiceChannel(channel) || isStageChannel(channel)) && channel.bitrate) {
                channelInfo.push({
                    name: t('channelinfo.bitrate'),
                    value: t('channelinfo.kbps', { count: Math.floor(channel.bitrate / 1000) }),
                    inline: true
                });
            }

            // Add user limit for voice channels
            if (isVoiceChannel(channel) && channel.userLimit && channel.userLimit > 0) {
                channelInfo.push({
                    name: t('channelinfo.userLimit'),
                    value: `${channel.userLimit}`,
                    inline: true
                });
            }

            // Add video quality for stage/voice
            if ((isVoiceChannel(channel) || isStageChannel(channel)) && channel.videoQualityMode) {
                const quality = channel.videoQualityMode === VideoQualityMode.Auto ? t('channelinfo.auto') : t('channelinfo.hd');
                channelInfo.push({
                    name: t('channelinfo.videoQuality'),
                    value: quality,
                    inline: true
                });
            }

            // Add nsfw status for text channels
            if (isTextChannel(channel) && !isThreadChannel(channel)) {
                channelInfo.push({
                    name: t('channelinfo.nsfw'),
                    value: channel.nsfw ? t('channelinfo.yes') : t('channelinfo.no'),
                    inline: true
                });
            }

            // Add creation date
            channelInfo.push({
                name: t('channelinfo.created'),
                value: `<t:${Math.floor(gChannel.createdTimestamp / 1000)}:F>`,
                inline: true
            });

            // Add position (guild channels only)
            channelInfo.push({
                name: t('channelinfo.position'),
                value: `${gChannel.rawPosition + 1}`,
                inline: true
            });

            // Create channel info embed
            const channelEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(t('channelinfo.title', { name: gChannel.name }))
                .addFields(channelInfo)
                .setTimestamp();

            // Add category if available
            if ('parent' in gChannel && gChannel.parent) {
                channelEmbed.addFields({
                    name: t('channelinfo.category'),
                    value: gChannel.parent.name,
                    inline: true
                });
            }

            await interaction.reply({ embeds: [channelEmbed] });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};