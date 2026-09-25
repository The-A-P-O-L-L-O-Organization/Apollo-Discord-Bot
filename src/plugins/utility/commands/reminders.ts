import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getUserReminders } from '../../../utils/reminderScheduler.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Reminders Command
    // Lists all active reminders for a user
    data: new SlashCommandBuilder()
        .setName('reminders')
        .setDescription('List your active reminders'),
    name: 'reminders',
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const userId = interaction.user.id;

            // Get user's reminders
            const reminders = await getUserReminders(userId);

            // Filter out expired reminders (they should be cleaned up by the scheduler, but just in case)
            const activeReminders = reminders.filter((r: { remindAt: number }) => r.remindAt > Date.now());

            if (activeReminders.length === 0) {
                await interaction.reply({
                    content: t('reminders.empty'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Sort by reminder time (soonest first)
            activeReminders.sort((a: { remindAt: number }, b: { remindAt: number }) => a.remindAt - b.remindAt);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(t('reminders.title'))
                .setDescription(t('reminders.description', { count: activeReminders.length }))
                .setTimestamp()
                .setFooter({ text: t('reminders.footer') });

            // Add each reminder as a field (max 25 fields in an embed)
            const maxReminderFields = activeReminders.length > 25 ? 24 : 25;
            const displayReminders = activeReminders.slice(0, maxReminderFields);

            for (const reminder of displayReminders) {
                const timestamp = Math.floor(reminder.remindAt / 1000);
                embed.addFields({
                    name: t('reminders.idLabel', { id: reminder.id }),
                    value: t('reminders.value', { message: `${reminder.message.substring(0, 200)}${reminder.message.length > 200 ? '...' : ''}`, relative: `<t:${timestamp}:R>`, absolute: `<t:${timestamp}:f>` }),
                    inline: false
                });
            }

            if (activeReminders.length > 25) {
                embed.addFields({
                    name: '\u200B',
                    value: t('reminders.more', { count: activeReminders.length - 25 }),
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

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