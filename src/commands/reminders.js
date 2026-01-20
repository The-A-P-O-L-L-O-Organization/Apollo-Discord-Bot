// Reminders Command
// Lists all active reminders for a user

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserReminders } from '../utils/reminderScheduler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reminders')
        .setDescription('List your active reminders'),
    category: 'utility',

    async execute(interaction) {
        const userId = interaction.user.id;

        // Get user's reminders
        const reminders = getUserReminders(userId);

        // Filter out expired reminders (they should be cleaned up by the scheduler, but just in case)
        const activeReminders = reminders.filter(r => r.remindAt > Date.now());

        if (activeReminders.length === 0) {
            return interaction.reply({
                content: 'You have no active reminders.\n\nUse `/remind` to create one!',
                ephemeral: true
            });
        }

        // Sort by reminder time (soonest first)
        activeReminders.sort((a, b) => a.remindAt - b.remindAt);

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('Your Reminders')
            .setDescription(`You have ${activeReminders.length} active reminder(s)`)
            .setTimestamp()
            .setFooter({ text: 'Use /cancelreminder <id> to cancel a reminder' });

        // Add each reminder as a field (max 25 fields in an embed)
        const displayReminders = activeReminders.slice(0, 25);
        
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

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
