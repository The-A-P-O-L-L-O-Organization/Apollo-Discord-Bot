import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { config } from '../../../config/config.js';
import { addReminder, parseTimeString } from '../../../utils/reminderScheduler.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const timeInput = interaction.options.getString('time') ?? '';
            const message = interaction.options.getString('message') ?? 'Reminder!';
            const userId = interaction.user.id;
            const guildId = interaction.guild?.id ?? 'dm';

            // Parse the time input
            const duration = parseTimeString(timeInput);

            if (!duration || duration <= 0) {
                await interaction.reply({
                    content: t('remind.badTime'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Check max duration
            if (duration > config.reminders.maxDuration) {
                const maxDays = Math.floor(config.reminders.maxDuration / (1000 * 60 * 60 * 24));
                await interaction.reply({
                    content: t('remind.tooLong', { days: maxDays }),
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
                channelId: interaction.channel?.id ?? null,
                guildId,
                createdAt: Date.now(),
                remindAt: reminderTime
            };

            // Save the reminder using the scheduler's function
            await addReminder(reminder);

            // Format the time for display
            const timestamp = Math.floor(reminderTime / 1000);

            await interaction.reply({
                content: t('remind.set', { relative: `<t:${timestamp}:R>`, absolute: `<t:${timestamp}:F>`, message, id: reminderId }),
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};