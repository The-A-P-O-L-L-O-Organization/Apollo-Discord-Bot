// Cancel Reminder Command
// Allows users to cancel a specific reminder

import { SlashCommandBuilder } from 'discord.js';
import { cancelReminder, getUserReminders } from '../utils/reminderScheduler.js';

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
    category: 'utility',

    async execute(interaction) {
        const reminderId = interaction.options.getString('id');
        const userId = interaction.user.id;

        // Get the reminder message before deleting (for confirmation)
        const reminders = getUserReminders(userId);
        const reminder = reminders.find(r => r.id === reminderId);

        if (!reminder) {
            return interaction.reply({
                content: `Could not find a reminder with ID \`${reminderId}\`.\n\nUse \`/reminders\` to see your active reminders and their IDs.`,
                ephemeral: true
            });
        }

        // Cancel the reminder
        const cancelled = cancelReminder(reminderId, userId);

        if (!cancelled) {
            return interaction.reply({
                content: `Failed to cancel the reminder. It may have already been sent or deleted.`,
                ephemeral: true
            });
        }

        return interaction.reply({
            content: `Reminder cancelled!\n\n**Message:** ${reminder.message}`,
            ephemeral: true
        });
    }
};
