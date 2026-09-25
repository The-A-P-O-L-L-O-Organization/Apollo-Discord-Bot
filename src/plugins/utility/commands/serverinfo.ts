import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder, ChannelType, SlashCommandBuilder } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display information about the server')
        .setNameLocalizations({
            'es-ES': 'infoservidor',
            de: 'serverinfo'
        })
        .setDescriptionLocalizations({
            'es-ES': 'Muestra información sobre el servidor',
            de: 'Zeigt Informationen über den Server'
        }),
    name: 'serverinfo',
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');

            const guild = interaction.guild!;

            await guild.fetch();

            const owner = await guild.fetchOwner();

            const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
            const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
            const forumChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildForum).size;
            const stageChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice).size;

            const totalMembers = guild.memberCount;
            const botCount = guild.members.cache.filter(m => m.user.bot).size;
            const humanCount = totalMembers - botCount;

            const boostLevel = guild.premiumTier;
            const boostCount = guild.premiumSubscriptionCount ?? 0;

            const verificationLevels: Record<number, string> = {
                0: 'None',
                1: 'Low',
                2: 'Medium',
                3: 'High',
                4: 'Highest'
            };

            const contentFilterLevels: Record<number, string> = {
                0: 'Disabled',
                1: 'Members without roles',
                2: 'All members'
            };

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(guild.name)
                .setThumbnail(guild.iconURL({ size: 256 }))
                .addFields(
                    {
                        name: 'General',
                        value: [
                            `**Owner:** ${owner.user.tag}`,
                            `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
                            `**Server ID:** ${guild.id}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: `Members (${totalMembers})`,
                        value: [
                            `**Humans:** ${humanCount}`,
                            `**Bots:** ${botCount}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: `Channels (${guild.channels.cache.size})`,
                        value: [
                            `**Text:** ${textChannels}`,
                            `**Voice:** ${voiceChannels}`,
                            `**Categories:** ${categories}`,
                            forumChannels > 0 ? `**Forum:** ${forumChannels}` : null,
                            stageChannels > 0 ? `**Stage:** ${stageChannels}` : null
                        ].filter(Boolean).join('\n'),
                        inline: true
                    },
                    {
                        name: 'Other',
                        value: [
                            `**Roles:** ${guild.roles.cache.size}`,
                            `**Emojis:** ${guild.emojis.cache.size}`,
                            `**Stickers:** ${guild.stickers.cache.size}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: 'Boost Status',
                        value: [
                            `**Level:** ${boostLevel}`,
                            `**Boosts:** ${boostCount}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: 'Security',
                        value: [
                            `**Verification:** ${verificationLevels[guild.verificationLevel]}`,
                            `**Content Filter:** ${contentFilterLevels[guild.explicitContentFilter]}`
                        ].join('\n'),
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ text: t('serverinfo.requestedBy', { user: interaction.user.tag }) });

            if (guild.bannerURL()) {
                embed.setImage(guild.bannerURL({ size: 512 }));
            }

            if (guild.description) {
                embed.setDescription(guild.description);
            }

            await interaction.reply({ embeds: [embed] });

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
