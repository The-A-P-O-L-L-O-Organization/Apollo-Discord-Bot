import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { sendModLog } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { removeTempban } from '../../../utils/tempbanScheduler.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'unban',
    description: 'Unban a previously banned user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-id',
            description: 'The ID of the user to unban',
            type: 3,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for unbanning',
            type: 3,
            required: false
        }
    ],

    async execute(interaction) {
        try {
            const userId = interaction.options.getString('user-id');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!userId) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User ID',
                    description: 'Please provide the ID of the user to unban.',
                    fields: [
                        {
                            name: '[HINT] How to get user ID',
                            value: '1. Enable Developer Mode in Discord settings\n2. Right-click on the user\n3. Select "Copy ID"'
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!/^\d{17,19}$/.test(userId)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid User ID',
                    description: 'Please provide a valid Discord user ID (17-19 digits).',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const ban = await interaction.guild.bans.fetch(userId).catch(() => null);

            if (!ban) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Not Banned',
                    description: 'This user is not banned from the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const bannedUser = ban.user;

            await interaction.guild.bans.remove(userId, reason);

            await removeTempban(interaction.guild.id, userId);

            const caseId = createModCase(interaction.guild.id, {
                type: 'unban',
                targetId: userId,
                targetTag: `User ID: ${userId}`,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Unbanned',
                description: `User ID ${userId} has been unbanned from the server.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Case ID',
                        value: `#${caseId}`,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: false
                    },
                    {
                        name: '[INFO] User ID',
                        value: userId,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild, {
                action: 'unban',
                target: { tag: `User ID: ${userId}`, id: userId, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Case ID': `#${caseId}`
                }
            });

            logger.info(`[MODERATION] User ${bannedUser.tag} was unbanned by ${interaction.user.tag}. Reason: ${reason}`);

        } catch (error) {
            logger.error('[ERROR] Unban command error:', error);

            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to unban the user.',
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
    }
};