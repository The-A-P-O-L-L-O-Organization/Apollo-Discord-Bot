import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, User, GuildMember } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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
            const targetUser = interaction.options.getUser('user') ?? interaction.user;
            const member = interaction.guild!.members.cache.get(targetUser.id) ||
                await interaction.guild!.members.fetch(targetUser.id);

            if (!member) {
                await interaction.reply({
                    content: '[ERROR] Could not find that user in this server.',
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
                statusIndicator = '[ONLINE]';
            } else if (status === 'idle') {
                statusIndicator = '[IDLE]';
            } else if (status === 'dnd') {
                statusIndicator = '[DND]';
            } else {
                statusIndicator = '[OFFLINE]';
            }

            const topRole = member.roles.highest;
            const roleCount = member.roles.cache.size - 1;

            // Calculate join position
            let joinPosition = 'Unknown';
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
                .setTitle(`User Information - ${statusIndicator}`)
                .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
                .addFields(
                    {
                        name: 'Username',
                        value: `**${targetUser.username}**${targetUser.discriminator !== '0' ? `#${targetUser.discriminator}` : ''}`,
                        inline: true
                    },
                    {
                        name: 'User ID',
                        value: `\`${targetUser.id}\``,
                        inline: true
                    },
                    {
                        name: 'Bot',
                        value: targetUser.bot ? 'Yes' : 'No',
                        inline: true
                    },
                    {
                        name: 'Account Created',
                        value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>\n(${daysOld} days ago)`,
                        inline: true
                    },
                    {
                        name: 'Joined Server',
                        value: `<t:${Math.floor((member.joinedTimestamp ?? Date.now()) / 1000)}:F>\n(${daysInServer} days ago)`,
                        inline: true
                    },
                    {
                        name: 'Status',
                        value: statusIndicator,
                        inline: true
                    }
                )
                .addFields(
                    {
                        name: 'Top Role',
                        value: topRole.toString(),
                        inline: true
                    },
                    {
                        name: 'Role Count',
                        value: roleCount > 0 ? `${roleCount} role(s)` : 'None',
                        inline: true
                    },
                    {
                        name: 'Position',
                        value: joinPosition,
                        inline: true
                    }
                );

            if (member.displayColor !== 0) {
                userInfoEmbed.setColor(member.displayHexColor);
            }

            userInfoEmbed.setFooter({
                text: `Requested by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            }).setTimestamp();

            await interaction.reply({ embeds: [userInfoEmbed] });

            logger.info(`[SUCCESS] Userinfo command executed by ${interaction.user.tag} for ${targetUser.tag}`);

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