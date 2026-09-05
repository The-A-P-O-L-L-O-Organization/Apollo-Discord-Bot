import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
// @ts-expect-error reminderScheduler.js not yet migrated
import { getUserReminders } from '../../../utils/reminderScheduler.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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
            const userId = interaction.user.id;

            // Get user's reminders
            const reminders = await getUserReminders(userId);

            // Filter out expired reminders (they should be cleaned up by the scheduler, but just in case)
            const activeReminders = reminders.filter((r: { remindAt: number }) => r.remindAt > Date.now());

            if (activeReminders.length === 0) {
                await interaction.reply({
                    content: 'You have no active reminders.\n\nUse `/remind` to create one!',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Sort by reminder time (soonest first)
            activeReminders.sort((a: { remindAt: number }, b: { remindAt: number }) => a.remindAt - b.remindAt);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Your Reminders')
                .setDescription(`You have ${activeReminders.length} active reminder(s)`)
                .setTimestamp()
                .setFooter({ text: 'Use /cancelreminder <id> to cancel a reminder' });

            // Add each reminder as a field (max 25 fields in an embed)
            const maxReminderFields = activeReminders.length > 25 ? 24 : 25;
            const displayReminders = activeReminders.slice(0, maxReminderFields);

            for (const reminder of displayReminders) {
                const timestamp = Math.floor(reminder.remindAt / 1000);
                embed.addFields({
                    name: `ID: \`${reminder.id}\``,
                    value: `**Message:** ${reminder.message.substring(0, 200)}${reminder.message.length > 200 ? '...' : ''}\n**Reminds:** <t:${timestamp}:R> (<t:${timestamp}:f>)`,
                    inline: false
                });
            }

            if (activeReminders.length > 25) {
                embed.addFields({
                    name: '\u200B',
                    value: `*...and ${activeReminders.length - 25} more reminder(s)*`,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

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