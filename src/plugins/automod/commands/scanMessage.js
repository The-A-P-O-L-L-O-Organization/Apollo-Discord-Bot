// Context Menu Command: Scan for NSFW
// Right-click a message → "Scan for NSFW"

import { ApplicationCommandType, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { checkMessageAttachments, formatNsfwPredictions } from '../../../utils/nsfwDetection.js';
import { safeError } from '../../../utils/safeError.js';

export default {
    name: 'Scan for NSFW',
    description: 'Scan a message for NSFW content',
    type: ApplicationCommandType.Message,
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers, // Permission to moderate members (for context menu)
    dmPermission: false, // Only works in guilds

    async execute(interaction) {
        try {
            // Check if the user has permission to view the channel and message
            if (!interaction.channel.viewable) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Permission Denied',
                        description: 'I cannot view this channel.',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }

            // Get the target message (the one right-clicked)
            const targetMessage = interaction.targetMessage;

            // Defer reply since NSFW detection might take a moment
            await interaction.deferReply({ ephemeral: true });

            // Check the message attachments for NSFW content
            const result = await checkMessageAttachments(interaction.guild.id, targetMessage);

            if (!result) {
                // No NSFW detected or detection not available
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('[INFO] NSFW Scan Complete')
                    .setDescription('No NSFW content detected in this message.')
                    .addFields({
                        name: 'Message',
                        value: targetMessage.content ? targetMessage.content.substring(0, 100) + (targetMessage.content.length > 100 ? '...' : '') : '*No text content*',
                        inline: false
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // NSFW detected
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('[WARNING] NSFW Content Detected')
                .setDescription('NSFW content was found in this message.')
                .addFields({
                    name: 'Message',
                    value: targetMessage.content ? targetMessage.content.substring(0, 100) + (targetMessage.content.length > 100 ? '...' : '') : '*No text content*',
                    inline: false
                },
                {
                    name: 'Detected Images',
                    value: result.images.length.toString(),
                    inline: true
                },
                {
                    name: 'Action Taken',
                    value: result.shouldDelete ? 'Message marked for deletion' : 'No action taken',
                    inline: true
                })
                .setTimestamp();

            // If we should delete and the bot has permission, delete the message
            if (result.shouldDelete && interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageMessages)) {
                try {
                    await targetMessage.delete();
                    embed.setDescription('NSFW content was found and the message has been deleted.');
                    embed.setColor('#00FF00');
                    embed.setTitle('[SUCCESS] NSFW Content Removed');
                } catch (deleteError) {
                    embed.addFields({
                        name: 'Deletion Error',
                        value: 'I don\'t have permission to delete this message.',
                        inline: false
                    });
                    console.error('[ERROR] Failed to delete NSFW message:', deleteError);
                }
            }

            // Add prediction details for each image
            if (result.images.length > 0) {
                const predictionsText = result.images.map((img, index) => {
                    return `**Image ${index + 1}:**\n${formatNsfwPredictions(img.predictions)}`;
                }).join('\n\n');

                embed.addFields({
                    name: 'Detection Details',
                    value: predictionsText.substring(0, 1024), // Embed field value limit
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Scan Failed',
                    description: 'An error occurred while scanning the message.',
                    fields: [{ name: 'Error', value: safeError(error) }],
                    timestamp: new Date().toISOString()
                }]
            });
        }
    }
};