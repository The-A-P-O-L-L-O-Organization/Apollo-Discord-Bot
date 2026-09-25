// Report Message Command - Context menu command to report messages
import type {
    MessageContextMenuCommandInteraction} from 'discord.js';
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { generateId, appendToGuildArray } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    data: {
        name: 'Report Message',
        type: 3 // ApplicationCommandType.Message
    },

    async execute(interaction: MessageContextMenuCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const message = interaction.targetMessage;

            if (message.author.id === interaction.user.id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('reportMessage.errorInvalidAction'),
                        description: t('reportMessage.youCannotReportYourOwn'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (message.author.bot) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('reportMessage.errorInvalidTarget'),
                        description: t('reportMessage.botProtectionDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            const reportId = generateId();
            const report = {
                reportId,
                messageId: message.id,
                channelId: message.channel.id,
                authorId: message.author.id,
                authorTag: message.author.tag,
                reporterId: interaction.user.id,
                reporterTag: interaction.user.tag,
                content: message.content.substring(0, 1000),
                timestamp: Date.now(),
                status: 'pending'
            };

            await appendToGuildArray('reports', interaction.guild!.id, 'entries', report);

            const modChannel = interaction.guild!.channels.cache.find(
                ch => ch.name === config.moderation.moderationLogChannel
            );

            if (modChannel?.isTextBased()) {
                const reportEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle(t('reportMessage.messageReported'))
                    .setDescription(t('reportMessage.aMessageHasBeenReported', { action: interaction.user.id }))
                    .addFields(
                        {
                            name: t('reportMessage.reportedMessageAuthor'),
                            value: `${message.author.tag}\n\`${message.author.id}\``,
                            inline: true
                        },
                        {
                            name: t('reportMessage.reporter'),
                            value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                            inline: true
                        },
                        {
                            name: t('reportMessage.channel'),
                            value: t('reportMessage.channelid', { channelId: message.channel.id }),
                            inline: true
                        },
                        {
                            name: t('reportMessage.messageContent'),
                            value: message.content ? (message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content) : '*No text content*',
                            inline: false
                        },
                        {
                            name: t('reportMessage.messageLink'),
                            value: t('reportMessage.jumpToMessageValue', { value: message.url }),
                            inline: false
                        },
                        {
                            name: t('reportMessage.reportId'),
                            value: reportId,
                            inline: true
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: t('reportMessage.useButtonsBelowToTake') });

                if (message.attachments.size > 0) {
                    reportEmbed.addFields({
                        name: t('reportMessage.attachments'),
                        value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n'),
                        inline: false
                    });
                }

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`report_delete_${reportId}`)
                            .setLabel(t('reportMessage.deleteMessage'))
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`report_warn_${reportId}`)
                            .setLabel(t('reportMessage.warnAuthor'))
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`report_dismiss_${reportId}`)
                            .setLabel(t('reportMessage.dismissReport'))
                            .setStyle(ButtonStyle.Secondary)
                    );

                await modChannel.send({
                    embeds: [reportEmbed],
                    components: [row]
                });
            }

            await interaction.reply({
                embeds: [{
                    color: 0x00FF00,
                    title: t('reportMessage.successMessageReported'),
                    description: t('reportMessage.thankYouForYourReport'),
                    fields: [
                        { name: t('reportMessage.reportId2'), value: reportId, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });

            logger.info({ msg: `[REPORT] Message ${message.id} reported by ${interaction.user.tag} (Report ID: ${reportId})` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('reportMessage.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};