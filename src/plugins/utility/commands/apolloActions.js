import { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getData, updateGuildData } from '../../../utils/db.js';
import { isOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { logger } from './utils/logger.js';

export default {
import { logger } from '../../../utils/logger.js';
    data: new ContextMenuCommandBuilder()
        .setName('Global Ban')
        .setType(ApplicationCommandType.User)
        .setDMPermission(true),
    name: 'Global Ban',
    type: 2,
    canQueue: false,

    async execute(interaction) {try {
try {

        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Access Denied',
                    description: 'Only the bot owner can use this command.'
                }],
                flags: 64
            });
        }

        const targetUser = interaction.targetUser;

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot globally ban yourself.'
                }],
                flags: 64
            });
        }

        if (targetUser.id === interaction.client.user.id) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot globally ban the bot.'
                }],
                flags: 64
            });
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

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

        await interaction.showModal(modal);

        try {
            const modalSubmit = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: i => i.customId === `apollo_gban_${interaction.id}`
            });

            const reason = modalSubmit.fields.getTextInputValue('reason').trim();

            const globalData = await getData('global_blacklist') || { entries: {} };
            const entries = globalData.entries || {};

            if (entries[targetUser.id]) {
                return modalSubmit.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: '[WARNING] Already Blacklisted',
                        description: `${targetUser.tag} is already on the global blacklist.\nReason: ${entries[targetUser.id].reason}`
                    }],
                    flags: 64
                });
            }

            await updateGuildData('global_blacklist', '__global__', (data) => {
                if (!data.entries) data.entries = {};
                data.entries[targetUser.id] = {
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
                    thumbnail: { url: targetUser.displayAvatarURL() },
                    timestamp: new Date().toISOString()
                }],
                flags: 64
            });

            logger.info(`[GLOBAL BAN] User ${targetUser.tag} globally blacklisted by ${interaction.user.tag}. Reason: ${reason}`);

        } catch (error) {
            if (error.message?.includes('time') || error.code === 'InteractionCollectorError') {
                return;
            }
            logger.error('[GLOBAL BAN] Error:', error.message);
            try {
                await interaction.followUp({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Command Failed',
                        description: 'An error occurred while processing the global ban.'
                    }],
                    flags: 64
                });
            } catch (e) {
                logger.error('[GLOBAL BAN] Failed to send error response:', e.message);
            }
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
};
