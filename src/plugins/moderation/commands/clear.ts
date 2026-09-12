// @ts-expect-error - JS file not yet migrated
import { logger } from '../../../utils/logger.js';
import { PermissionsBitField, ChatInputCommandInteraction, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Message } from 'discord.js';
// @ts-expect-error - JS file not yet migrated
import { sendModLog } from '../../../utils/modLog.js';
// @ts-expect-error - JS file not yet migrated
import { safeError } from '../../../utils/safeError.js';
// @ts-expect-error - JS file not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface ClearCommand {
    name: string;
    description: string;
    category: string;
    defaultMemberPermissions: bigint;
    dmPermission: boolean;
    options: Array<{
        name: string;
        description: string;
        type: number;
        required?: boolean;
        min_value?: number;
        max_value?: number;
    }>;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
    deleteMessages(interaction: ChatInputCommandInteraction, channel: any, amount: number): Promise<void>;
    handleDeleteAll(interaction: ChatInputCommandInteraction, channel: any): Promise<void>;
}

const clearCommand: ClearCommand = {
    name: 'clear',
    description: 'Bulk delete messages in the current channel',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'amount',
            description: 'Number of messages to delete (1-100)',
            type: 4, // INTEGER type
            required: false,
            min_value: 1,
            max_value: 100
        },
        {
            name: 'all',
            description: 'Delete all messages in the channel (requires confirmation)',
            type: 5, // BOOLEAN type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const channel = interaction.channel;
            const amount = interaction.options.getInteger('amount');
            const deleteAll = interaction.options.getBoolean('all');

            if (!channel || !channel.isTextBased()) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Channel',
                        description: 'Messages can only be cleared in text channels.'
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (deleteAll) {
                return await this.handleDeleteAll(interaction, channel);
            }

            const finalAmount = amount || 5;

            await this.deleteMessages(interaction, channel, finalAmount);

        } catch (error) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: safeError(error)
                }],
                flags: MessageFlags.Ephemeral
            });
        }
    },

    async deleteMessages(interaction: ChatInputCommandInteraction, channel: any, amount: number) {
        const fetched = await channel.messages.fetch({ limit: amount });

        if (fetched.size === 0) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFAA00,
                    title: '[WARNING] No Messages',
                    description: 'No messages found to delete.'
                }],
                flags: MessageFlags.Ephemeral
            });
        }

        const deleted = await channel.bulkDelete(fetched, true);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('[SUCCESS] Messages Cleared')
            .setDescription(`Successfully deleted ${deleted.size} message(s) from ${channel}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        await sendModLog(interaction.guild!, {
            action: 'clear',
            target: { tag: `#${channel.name}`, id: channel.id },
            moderator: interaction.user,
            extra: {
                'Channel': `<#${channel.id}>`,
                'Messages Deleted': deleted.size.toString()
            }
        });
    },

    async handleDeleteAll(interaction: ChatInputCommandInteraction, channel: any) {
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('[WARNING] Confirm Delete All')
            .setDescription(`Are you sure you want to delete ALL messages in ${channel}?\n\nThis action cannot be undone.`)
            .addFields({
                name: 'Instructions',
                value: 'Click **Confirm** to delete all messages, or **Cancel** to abort.'
            });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_delete_all')
                    .setLabel('Confirm')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_delete_all')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        const response = await interaction.reply({
            embeds: [confirmEmbed],
            components: [row],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            time: 60000,
            filter: i => i.user.id === interaction.user.id
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'confirm_delete_all') {
                collector.stop();
                await buttonInteraction.deferUpdate();

                try {
                    let totalDeleted = 0;
                    let hasMore = true;

                    while (hasMore) {
                        const fetched = await channel.messages.fetch({ limit: 100 });

                        if (fetched.size === 0) {
                            hasMore = false;
                            break;
                        }

                        const deleted = await channel.bulkDelete(fetched, true);
                        totalDeleted += deleted.size;

                        if (fetched.size < 100) {
                            hasMore = false;
                        }

                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('[SUCCESS] All Messages Deleted')
                        .setDescription(`Successfully deleted ${totalDeleted} message(s) from ${channel}.`);

                    await interaction.editReply({
                        embeds: [successEmbed],
                        components: []
                    });

                    await sendModLog(interaction.guild!, {
                        action: 'clear_all',
                        target: { tag: `#${channel.name}`, id: channel.id },
                        moderator: interaction.user,
                        extra: {
                            'Channel': `<#${channel.id}>`,
                            'Messages Deleted': totalDeleted.toString()
                        }
                    });

                } catch (error) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('[ERROR] Delete Failed')
                        .setDescription(safeError(error));

                    await interaction.editReply({
                        embeds: [errorEmbed],
                        components: []
                    });
                }

            } else if (buttonInteraction.customId === 'cancel_delete_all') {
                collector.stop();

                const cancelEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('[CANCELLED] Operation Aborted')
                    .setDescription('No messages were deleted.');

                await buttonInteraction.update({
                    embeds: [cancelEmbed],
                    components: []
                });
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('[TIMEOUT] Confirmation Expired')
                    .setDescription('The confirmation has expired. No messages were deleted.');

                try {
                    await interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: []
                    });
                } catch {
                    // Message may have been deleted
                }
            }
        });
    }
};

export default clearCommand;