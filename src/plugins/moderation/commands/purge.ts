// Purge Command - Delete multiple messages from a channel
import type { ChatInputCommandInteraction, TextChannel, ThreadChannel, NewsChannel } from 'discord.js';
import { ApplicationCommandType, Collection, MessageFlags, PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { i18n } from '../../../i18n/index.js';

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

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const amount = interaction.options.getInteger('amount') ?? 0;
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('purge.noReason');

            if (!amount || amount < 1 || amount > 100) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('purge.errorInvalidAmount'),
                    description: t('purge.pleaseSpecifyANumberBetween'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const manageableChannel = interaction.channel as (TextChannel | ThreadChannel | NewsChannel) | null;

            if (!manageableChannel) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('purge.errorNoChannel'),
                        description: t('purge.thisCommandMustBeUsed'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const botUser = interaction.client.user;
            const channelPerms = manageableChannel.permissionsFor(botUser);
            if (!channelPerms?.has(PermissionsBitField.Flags.ManageMessages)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('purge.errorMissingPermissions'),
                    description: t('purge.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            let messages = await manageableChannel.messages.fetch({ limit: amount });

            if (targetUser) {
                messages = messages.filter(msg => msg.author.id === targetUser.id);
                messages = new Collection([...messages].slice(0, 100));
            }

            if (targetUser) {
                const targetMember = await fetchMember(interaction.guild!, targetUser.id).catch(() => null);
                const hierarchy = canModerate(interaction.guild!, interaction.member, targetMember);
                if (!hierarchy.ok) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('purge.hierarchyTitle'),
                        description: hierarchy.reason,
                        timestamp: new Date().toISOString()
                    };
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    return;
                }
            }

            if (messages.size === 0) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('purge.errorNoMessagesFound'),
                    description: targetUser
                        ? `No messages from ${targetUser.tag} found to delete.`
                        : 'No messages found to delete.',
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const deletedMessages = await manageableChannel.bulkDelete(messages, true);

            if (deletedMessages.size === 0 && messages.size > 0) {
                await interaction.reply({
                    content: t('purge.couldNotDeleteMessagesThey'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const successEmbed = {
                color: 0x00FF00,
                title: t('purge.successMessagesDeleted'),
                description: t('purge.successfullyDeletedCountMessageS', { count: deletedMessages.size }),
                fields: [
                    { name: t('purge.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('purge.infoChannel'), value: manageableChannel.name ?? t('purge.unknown'), inline: true },
                    { name: t('purge.fieldReason'), value: reason, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            if (targetUser) {
                successEmbed.fields.splice(3, 0, {
                    name: t('purge.infoFilteredUser'),
                    value: targetUser.tag,
                    inline: true
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'purge',
                target: targetUser ?? interaction.user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `#${manageableChannel.name ?? 'Unknown'}`,
                    'Messages Deleted': `${deletedMessages.size}`,
                    'Filter': targetUser ? `Messages from ${targetUser.tag}` : 'All messages'
                }
            });

            logger.info({ msg: `[MODERATION] ${deletedMessages.size} messages deleted by ${interaction.user.tag}. Channel: ${manageableChannel.name ?? 'Unknown'}. Reason: ${reason}` });

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: t('purge.commandFailedTitle'),
                description: t('purge.commandFailedDescription'),
                fields: [
                    {
                        name: t('purge.errorDetails'),
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