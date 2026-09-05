import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { config } from '../../../config/config.js';
// @ts-expect-error reminderScheduler.js not yet migrated
import { addReminder, parseTimeString } from '../../../utils/reminderScheduler.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    // Remind Command
    // Allows users to set reminders
    name: 'remind',
    description: 'Set a reminder',
    category: 'utility',
    dmPermission: false,
    options: [
        {
            name: 'time',
            description: 'When to remind you (e.g., 10m, 1h, 2d, 1w)',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'message',
            description: 'What to remind you about',
            type: 3, // STRING type
            required: true
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const timeInput = interaction.options.getString('time');
            const message = interaction.options.getString('message');
            const userId = interaction.user.id;
            const guildId = interaction.guild?.id ?? 'dm';

            // Parse the time input
            const duration = parseTimeString(timeInput);

            if (!duration || duration <= 0) {
                await interaction.reply({
                    content: 'Invalid time format. Use formats like: `10m` (10 minutes), `1h` (1 hour), `2d` (2 days), `1w` (1 week).',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Check max duration
            if (duration > config.reminders.maxDuration) {
                const maxDays = Math.floor(config.reminders.maxDuration / (1000 * 60 * 60 * 24));
                await interaction.reply({
                    content: `Reminder duration cannot exceed ${maxDays} days.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Calculate reminder time
            const reminderTime = Date.now() + duration;
            const reminderId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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
            await addReminder(reminder);

            // Format the time for display
            const timestamp = Math.floor(reminderTime / 1000);

            await interaction.reply({
                content: `Reminder set! I'll remind you <t:${timestamp}:R> (<t:${timestamp}:F>).\n\n**Message:** ${message}\n**Reminder ID:** \`${reminderId}\``,
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