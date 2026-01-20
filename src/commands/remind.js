// Remind Command
// Allows users to set reminders

import { SlashCommandBuilder } from 'discord.js';
import { addReminder, parseTimeString } from '../utils/reminderScheduler.js';
import { config } from '../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('When to remind you (e.g., 10m, 1h, 2d, 1w)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('What to remind you about')
                .setRequired(true)
        ),
    category: 'utility',

    async execute(interaction) {
        const timeInput = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id || 'dm';

        // Parse the time input
        const duration = parseTimeString(timeInput);

        if (!duration || duration <= 0) {
            return interaction.reply({
                content: 'Invalid time format. Use formats like: `10m` (10 minutes), `1h` (1 hour), `2d` (2 days), `1w` (1 week).',
                ephemeral: true
            });
        }

        // Check max duration
        if (duration > config.reminders.maxDuration) {
            const maxDays = Math.floor(config.reminders.maxDuration / (1000 * 60 * 60 * 24));
            return interaction.reply({
                content: `Reminder duration cannot exceed ${maxDays} days.`,
                ephemeral: true
            });
        }

        // Calculate reminder time
        const reminderTime = Date.now() + duration;
        const reminderId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create reminder object
        const reminder = {
            id: reminderId,
            userId,
            message,
            channelId: interaction.channel.id,
            guildId,
            createdAt: Date.now(),
            remindAt: reminderTime
        };

        // Save the reminder using the scheduler's function
        addReminder(reminder);

        // Format the time for display
        const timestamp = Math.floor(reminderTime / 1000);

        return interaction.reply({
            content: `Reminder set! I'll remind you <t:${timestamp}:R> (<t:${timestamp}:F>).\n\n**Message:** ${message}\n**Reminder ID:** \`${reminderId}\``,
            ephemeral: true
        });
    }
};
