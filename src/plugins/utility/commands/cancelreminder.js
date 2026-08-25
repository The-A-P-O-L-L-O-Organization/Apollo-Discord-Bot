// Cancel Reminder Command
// Allows users to cancel a specific reminder

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { cancelReminder, getUserReminders } from '../../../utils/reminderScheduler.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cancelreminder')
        .setDescription('Cancel a reminder')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('The reminder ID (use /reminders to see your reminder IDs)')
                .setRequired(true)
        ),
    name: 'cancelreminder',
    category: 'utility',

    async execute(interaction) {
        try {
            const reminderId = interaction.options.getString('id');
            const userId = interaction.user.id;

            // Get the reminder message before deleting (for confirmation)
            const reminders = await getUserReminders(userId);
            const reminder = reminders.find(r => r.id === reminderId);

            if (!reminder) {
                return interaction.reply({
                    content: `Could not find a reminder with ID \`${reminderId}\`.\n\nUse \`/reminders\` to see your active reminders and their IDs.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Cancel the reminder
            const cancelled = await cancelReminder(reminderId, userId);

            if (!cancelled) {
                return interaction.reply({
                    content: 'Failed to cancel the reminder. It may have already been sent or deleted.',
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: `Reminder cancelled!\n\n**Message:** ${reminder.message}`,
                flags: MessageFlags.Ephemeral
            });
        
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
