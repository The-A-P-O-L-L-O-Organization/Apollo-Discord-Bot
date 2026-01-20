// Poll Command
// Creates polls with optional duration for auto-tally

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { appendToGuildArray, generateId } from '../utils/dataStore.js';
import { config } from '../config/config.js';

// Emoji options for polls
const POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export default {
    name: 'poll',
    description: 'Create a poll',
    category: 'utility',
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'question',
            description: 'The poll question',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'options',
            description: 'Poll options separated by | (e.g., "Yes | No | Maybe")',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'duration',
            description: 'Poll duration (e.g., 1h, 6h, 1d, 3d). Leave empty for no auto-close.',
            type: 3, // STRING type
            required: false
        },
        {
            name: 'anonymous',
            description: 'Hide who voted for what (default: false)',
            type: 5, // BOOLEAN type
            required: false
        }
    ],

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const optionsInput = interaction.options.getString('options');
        const durationInput = interaction.options.getString('duration');
        const anonymous = interaction.options.getBoolean('anonymous') || false;

        // Parse options
        const options = optionsInput
            .split('|')
            .map(opt => opt.trim())
            .filter(opt => opt.length > 0);

        if (options.length < 2) {
            return interaction.reply({
                content: 'A poll must have at least 2 options. Separate options with `|`.',
                ephemeral: true
            });
        }

        if (options.length > config.polls.maxOptions) {
            return interaction.reply({
                content: `A poll can have a maximum of ${config.polls.maxOptions} options.`,
                ephemeral: true
            });
        }

        // Parse duration if provided
        let endTime = null;
        if (durationInput) {
            const duration = parseTimeString(durationInput);
            if (!duration) {
                return interaction.reply({
                    content: 'Invalid duration format. Use formats like: `1h` (1 hour), `6h` (6 hours), `1d` (1 day).',
                    ephemeral: true
                });
            }

            if (duration > config.polls.maxDuration) {
                const maxDays = Math.floor(config.polls.maxDuration / (1000 * 60 * 60 * 24));
                return interaction.reply({
                    content: `Poll duration cannot exceed ${maxDays} days.`,
                    ephemeral: true
                });
            }

            endTime = Date.now() + duration;
        }

        // Build the poll embed
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('📊 ' + question)
            .setFooter({ 
                text: `Poll by ${interaction.user.tag}${anonymous ? ' • Anonymous voting' : ''}` 
            })
            .setTimestamp();

        // Build options string
        let optionsText = '';
        for (let i = 0; i < options.length; i++) {
            optionsText += `${POLL_EMOJIS[i]} ${options[i]}\n`;
        }
        embed.setDescription(optionsText);

        // Add end time if set
        if (endTime) {
            const timestamp = Math.floor(endTime / 1000);
            embed.addFields({
                name: 'Poll Ends',
                value: `<t:${timestamp}:R> (<t:${timestamp}:f>)`,
                inline: false
            });
        }

        // Send the poll
        await interaction.deferReply();
        const pollMessage = await interaction.editReply({ embeds: [embed] });

        // Add reactions for each option
        for (let i = 0; i < options.length; i++) {
            try {
                await pollMessage.react(POLL_EMOJIS[i]);
            } catch (error) {
                console.error(`[ERROR] Failed to add reaction ${POLL_EMOJIS[i]}:`, error);
            }
        }

        // If there's a duration, save the poll for auto-tally
        if (endTime) {
            const pollId = generateId();
            const pollData = {
                id: pollId,
                messageId: pollMessage.id,
                channelId: interaction.channel.id,
                question,
                options,
                anonymous,
                createdBy: interaction.user.id,
                createdAt: Date.now(),
                endTime
            };

            appendToGuildArray('polls', interaction.guild.id, 'active', pollData);
        }
    }
};

/**
 * Parses a time string into milliseconds
 * @param {string} timeString - The time string (e.g., "1h", "6h", "1d")
 * @returns {number|null} Duration in milliseconds or null if invalid
 */
function parseTimeString(timeString) {
    const regex = /^(\d+)(m|h|d|w)$/i;
    const match = timeString.trim().match(regex);

    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const multipliers = {
        'm': 60 * 1000,               // minutes
        'h': 60 * 60 * 1000,          // hours
        'd': 24 * 60 * 60 * 1000,     // days
        'w': 7 * 24 * 60 * 60 * 1000  // weeks
    };

    return value * multipliers[unit];
}
