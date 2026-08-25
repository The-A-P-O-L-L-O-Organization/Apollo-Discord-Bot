import { logger } from '../../../utils/logger.js';
import { ApplicationCommandType, PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'purge',
    description: 'Delete multiple messages from a channel',
    category: 'Moderation',
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'amount',
            description: 'Number of messages to delete (1-100)',
            type: 4,
            required: true,
            min_value: 1,
            max_value: 100
        },
        {
            name: 'user',
            description: 'Only delete messages from this user',
            type: 6,
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for deleting messages',
            type: 3,
            required: false
        }
    ],

    async execute(interaction) {
        try {
            const amount = interaction.options.getInteger('amount');
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!amount || amount < 1 || amount > 100) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Amount',
                    description: 'Please specify a number between 1 and 100.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const channel = interaction.channel;

            if (!channel.permissionsFor(interaction.client.user).has(PermissionsBitField.Flags.ManageMessages)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing Permissions',
                    description: 'I do not have permission to delete messages in this channel.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            let messages = await channel.messages.fetch({ limit: amount });

            if (targetUser) {
                messages = messages.filter(msg => msg.author.id === targetUser.id);
                messages = new Map([...messages].slice(0, 100));
            }

            if (targetUser) {
                const targetMember = await fetchMember(interaction.guild, targetUser.id).catch(() => null);
                const hierarchy = canModerate(interaction.guild, interaction.member, targetMember);
                if (!hierarchy.ok) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: '[ERROR] Hierarchy Check Failed',
                        description: hierarchy.reason,
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            }

            if (messages.size === 0) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] No Messages Found',
                    description: targetUser
                        ? `No messages from ${targetUser.tag} found to delete.`
                        : 'No messages found to delete.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const deletedMessages = await channel.bulkDelete(messages, true);

            if (deletedMessages.size === 0 && messages.size > 0) {
                return interaction.reply({
                    content: 'Could not delete messages - they may be older than 14 days.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] Messages Deleted',
                description: `Successfully deleted ${deletedMessages.size} message(s).`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Channel',
                        value: channel.name,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            if (targetUser) {
                successEmbed.fields.splice(3, 0, {
                    name: '[INFO] Filtered User',
                    value: targetUser.tag,
                    inline: true
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild, {
                action: 'purge',
                target: targetUser || interaction.user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `#${channel.name}`,
                    'Messages Deleted': `${deletedMessages.size}`,
                    'Filter': targetUser ? `Messages from ${targetUser.tag}` : 'All messages'
                }
            });

            logger.info(`[MODERATION] ${deletedMessages.size} messages deleted by ${interaction.user.tag}. Channel: ${channel.name}. Reason: ${reason}`);

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to delete messages.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: safeError(error),
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