import { UserContextMenuCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { getData, updateGuildData } from '../../../utils/db.js';
import { isOwner } from '../../../utils/accessControl.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';

interface GlobalBlacklistData {
    entries: Record<string, {
        userId: string;
        userTag: string;
        reason: string;
        moderatorId: string;
        moderatorTag: string;
        addedAt: number;
    }>;
}

export default {
    data: new (require('discord.js').ContextMenuCommandBuilder)()
        .setName('Global Ban')
        .setType(require('discord.js').ApplicationCommandType.User)
        .setDMPermission(true),
    name: 'Global Ban',
    type: 2,
    canQueue: false,

    async execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
        try {
            if (!isOwner(interaction.user.id)) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Access Denied',
                        description: 'Only the bot owner can use this command.'
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const targetUser = interaction.targetUser;

            if (targetUser.id === interaction.user.id) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Self Action',
                        description: 'You cannot globally ban yourself.'
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (targetUser.id === interaction.client.user.id) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Bot Protection',
                        description: 'You cannot globally ban the bot.'
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`apollo_gban_${interaction.id}`)
                .setTitle('Global Ban — Reason');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason for global ban')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter the reason for this global ban...')
                .setMaxLength(1000)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: (i) => i.customId === `apollo_gban_${interaction.id}`
            });

            const reason = modalSubmit.fields.getTextInputValue('reason').trim();

            const globalData = await getData('global_blacklist') as GlobalBlacklistData | undefined ?? { entries: {} };
            const entries = globalData.entries ?? {};

            if (entries[targetUser.id]) {
                await modalSubmit.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: '[WARNING] Already Blacklisted',
                        description: `${targetUser.tag} is already on the global blacklist.\nReason: ${entries[targetUser.id].reason}`
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await updateGuildData('global_blacklist', '__global__', (data: Record<string, unknown>) => {
                if (!data.entries) { data.entries = {}; }
                (data.entries as Record<string, unknown>)[targetUser.id] = {
                    userId: targetUser.id,
                    userTag: targetUser.tag,
                    reason: reason,
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    addedAt: Date.now()
                };
                return data;
            });

            await modalSubmit.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[SUCCESS] User Globally Blacklisted',
                    description: `${targetUser.tag} has been added to the global blacklist. They will be banned from all servers the bot is in.`,
                    fields: [
                        { name: 'User', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                        { name: 'Moderator', value: interaction.user.tag, inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    ],
                    thumbnail: { url: targetUser.displayAvatarURL({ extension: 'png', size: 256 }) },
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });

            logger.info({ msg: `[GLOBAL BAN] User ${targetUser.tag} globally blacklisted by ${interaction.user.tag}. Reason: ${reason}` });
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