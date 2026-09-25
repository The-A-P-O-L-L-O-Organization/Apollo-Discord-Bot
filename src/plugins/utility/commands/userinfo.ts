import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'userinfo',
    description: 'Displays information about a user',
    category: 'Utility',

    options: [
        {
            name: 'user',
            type: 6,
            description: 'The user to get information about',
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
            const targetUser = interaction.options.getUser('user') ?? interaction.user;
            const member = interaction.guild!.members.cache.get(targetUser.id) ??
                await interaction.guild!.members.fetch(targetUser.id);

            if (!member) {
                await interaction.reply({
                    content: t('userinfo.notFound'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const accountAge = Date.now() - targetUser.createdTimestamp;
            const daysOld = Math.floor(accountAge / (1000 * 60 * 60 * 24));

            const joinAge = Date.now() - (member.joinedTimestamp ?? Date.now());
            const daysInServer = Math.floor(joinAge / (1000 * 60 * 60 * 24));

            const status = member.presence?.status ?? 'offline';
            let statusIndicator: string;
            if (status === 'online') {
                statusIndicator = t('userinfo.online');
            } else if (status === 'idle') {
                statusIndicator = t('userinfo.idle');
            } else if (status === 'dnd') {
                statusIndicator = t('userinfo.dnd');
            } else {
                statusIndicator = t('userinfo.offline');
            }

            const topRole = member.roles.highest;
            const roleCount = member.roles.cache.size - 1;

            // Calculate join position
            let joinPosition = t('userinfo.unknownPos');
            if (member.joinedTimestamp) {
                const sortedMembers = interaction.guild!.members.cache
                    .filter(m => m.joinedTimestamp)
                    .sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp!);
                const index = sortedMembers.map(m => m.id).indexOf(member.id);
                if (index >= 0) {
                    joinPosition = `#${index + 1}`;
                }
            }
            joinPosition += ` of ${interaction.guild!.memberCount}`;

            const userInfoEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(t('userinfo.title', { status: statusIndicator }))
                .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
                .addFields(
                    {
                        name: t('userinfo.username'),
                        value: `**${targetUser.username}**${targetUser.discriminator !== '0' ? `#${targetUser.discriminator}` : ''}`,
                        inline: true
                    },
                    {
                        name: t('userinfo.userId'),
                        value: `\`${targetUser.id}\``,
                        inline: true
                    },
                    {
                        name: t('userinfo.bot'),
                        value: targetUser.bot ? t('userinfo.yes') : t('userinfo.no'),
                        inline: true
                    },
                    {
                        name: t('userinfo.created'),
                        value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>\n(${t('userinfo.daysAgo', { count: daysOld })})`,
                        inline: true
                    },
                    {
                        name: t('userinfo.joined'),
                        value: `<t:${Math.floor((member.joinedTimestamp ?? Date.now()) / 1000)}:F>\n(${t('userinfo.daysAgo', { count: daysInServer })})`,
                        inline: true
                    },
                    {
                        name: t('userinfo.status'),
                        value: statusIndicator,
                        inline: true
                    }
                )
                .addFields(
                    {
                        name: t('userinfo.topRole'),
                        value: topRole.toString(),
                        inline: true
                    },
                    {
                        name: t('userinfo.roleCount'),
                        value: roleCount > 0 ? t('userinfo.rolesValue', { count: roleCount }) : t('userinfo.none'),
                        inline: true
                    },
                    {
                        name: t('userinfo.position'),
                        value: joinPosition,
                        inline: true
                    }
                );

            if (member.displayColor !== 0) {
                userInfoEmbed.setColor(member.displayHexColor);
            }

            userInfoEmbed.setFooter({
                text: t('userinfo.requestedBy', { user: interaction.user.tag }),
                iconURL: interaction.user.displayAvatarURL()
            }).setTimestamp();

            await interaction.reply({ embeds: [userInfoEmbed] });

            logger.info(`[SUCCESS] Userinfo command executed by ${interaction.user.tag} for ${targetUser.tag}`);

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