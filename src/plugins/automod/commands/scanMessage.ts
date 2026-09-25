// Context Menu Command: Scan for NSFW
// Right-click a message → "Scan for NSFW"
import { createLogger } from '../../../utils/logger.js';
import type { MessageContextMenuCommandInteraction, TextChannel } from 'discord.js';
import { ApplicationCommandType, EmbedBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { checkMessageAttachments, formatNsfwPredictions } from '../../../utils/nsfwDetection.js';
import { safeError } from '../../../utils/safeError.js';
import { i18n } from '../../../i18n/index.js';

const logger = createLogger({ component: 'automod:scanMessage' });

export default {
    name: 'Scan for NSFW',
    description: 'Scan a message for NSFW content',
    type: ApplicationCommandType.Message,
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers, // Permission to moderate members (for context menu)
    dmPermission: false, // Only works in guilds

    async execute(interaction: MessageContextMenuCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
        const t = i18n.getFixedT(resolved, 'automod');
        try {
            // Check if the user has permission to view the channel and message
            const channel = interaction.channel as TextChannel | null;
            if (!channel?.viewable) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('scanMessage.permissionDeniedTitle'),
                        description: t('scanMessage.permissionDeniedDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Get the target message (the one right-clicked)
            const targetMessage = interaction.targetMessage;

            // Defer reply since NSFW detection might take a moment
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Check the message attachments for NSFW content
            const result = await checkMessageAttachments(interaction.guild!.id, targetMessage);

            if (!result) {
                // No NSFW detected or detection not available
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(t('scanMessage.completeTitle'))
                    .setDescription(t('scanMessage.completeDescription'))
                    .addFields({
                        name: t('scanMessage.fieldMessage'),
                        value: targetMessage.content ? targetMessage.content.substring(0, 100) + (targetMessage.content.length > 100 ? '...' : '') : t('scanMessage.noText'),
                        inline: false
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // NSFW detected
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(t('scanMessage.detectedTitle'))
                .setDescription(t('scanMessage.detectedDescription'))
                .addFields({
                    name: t('scanMessage.fieldMessage'),
                    value: targetMessage.content ? targetMessage.content.substring(0, 100) + (targetMessage.content.length > 100 ? '...' : '') : t('scanMessage.noText'),
                    inline: false
                },
                {
                    name: t('scanMessage.fieldImages'),
                    value: result.images.length.toString(),
                    inline: true
                },
                {
                    name: t('scanMessage.fieldAction'),
                    value: result.shouldDelete ? t('scanMessage.actionDelete') : t('scanMessage.actionNone'),
                    inline: true
                })
                .setTimestamp();

            // If we should delete and the bot has permission, delete the message
            if (result.shouldDelete && (channel?.permissionsFor(interaction.guild!.members.me!)?.has(PermissionsBitField.Flags.ManageMessages) ?? false)) {
                try {
                    await targetMessage.delete();
                    embed.setDescription(t('scanMessage.removedDescription'));
                    embed.setColor('#00FF00');
                    embed.setTitle(t('scanMessage.removedTitle'));
                } catch (deleteError) {
                    embed.addFields({
                        name: t('scanMessage.deletionErrorTitle'),
                        value: t('scanMessage.deletionErrorDescription'),
                        inline: false
                    });
                    logger.error({ msg: '[ERROR] Failed to delete NSFW message', error: deleteError });
                }
            }

            // Add prediction details for each image
            if (result.images.length > 0) {
                const predictionsText = result.images.map((img, index) => {
                    return `**Image ${index + 1}:**\n${formatNsfwPredictions(img.predictions)}`;
                }).join('\n\n');

                embed.addFields({
                    name: t('scanMessage.detailsTitle'),
                    value: predictionsText.substring(0, 1024), // Embed field value limit
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('scanMessage.failedTitle'),
                    description: t('scanMessage.failedDescription'),
                    fields: [{ name: t('scanMessage.fieldError'), value: safeError(error) }],
                    timestamp: new Date().toISOString()
                }]
            });
        }
    }
};