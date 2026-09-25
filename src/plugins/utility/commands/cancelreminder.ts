import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { cancelReminder, getUserReminders } from '../../../utils/reminderScheduler.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Cancel Reminder Command
    // Allows users to cancel a specific reminder
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

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const reminderId = interaction.options.getString('id') ?? '';
            const userId = interaction.user.id;

            // Get the reminder message before deleting (for confirmation)
            const reminders = await getUserReminders(userId);
            const reminder = reminders.find((r: { id: string; message: string }) => r.id === reminderId);

            if (!reminder) {
                await interaction.reply({
                    content: t('cancelreminder.notFound', { id: reminderId }),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Cancel the reminder
            const cancelled = await cancelReminder(reminderId, userId);

            if (!cancelled) {
                await interaction.reply({
                    content: t('cancelreminder.failed'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: t('cancelreminder.cancelled', { message: reminder.message }),
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