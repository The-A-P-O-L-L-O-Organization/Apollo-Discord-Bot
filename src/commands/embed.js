// Embed Command
// Allows users to create custom embeds

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create a custom embed message')
        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('The embed title')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('description')
                .setDescription('The embed description (supports Discord markdown)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('color')
                .setDescription('Hex color code (e.g., #FF0000)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('image')
                .setDescription('URL for the main embed image')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('thumbnail')
                .setDescription('URL for the thumbnail image')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('footer')
                .setDescription('Footer text')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('author')
                .setDescription('Author name')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('URL for the title link')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('timestamp')
                .setDescription('Add a timestamp to the embed')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: 'utility',

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color');
        const image = interaction.options.getString('image');
        const thumbnail = interaction.options.getString('thumbnail');
        const footer = interaction.options.getString('footer');
        const author = interaction.options.getString('author');
        const url = interaction.options.getString('url');
        const timestamp = interaction.options.getBoolean('timestamp');

        // Must have at least title or description
        if (!title && !description) {
            return interaction.reply({
                content: 'You must provide at least a title or description for the embed.',
                ephemeral: true
            });
        }

        // Create the embed
        const embed = new EmbedBuilder();

        // Set title
        if (title) {
            embed.setTitle(title);
        }

        // Set description
        if (description) {
            embed.setDescription(description);
        }

        // Set color
        if (color) {
            // Validate hex color
            const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
            const match = color.match(hexRegex);
            if (match) {
                embed.setColor(`#${match[1]}`);
            } else {
                return interaction.reply({
                    content: 'Invalid color format. Please use a hex color code (e.g., #FF0000 or FF0000).',
                    ephemeral: true
                });
            }
        } else {
            embed.setColor('#3498DB'); // Default blue color
        }

        // Set image
        if (image) {
            if (!isValidUrl(image)) {
                return interaction.reply({
                    content: 'Invalid image URL. Please provide a valid URL.',
                    ephemeral: true
                });
            }
            embed.setImage(image);
        }

        // Set thumbnail
        if (thumbnail) {
            if (!isValidUrl(thumbnail)) {
                return interaction.reply({
                    content: 'Invalid thumbnail URL. Please provide a valid URL.',
                    ephemeral: true
                });
            }
            embed.setThumbnail(thumbnail);
        }

        // Set footer
        if (footer) {
            embed.setFooter({ text: footer });
        }

        // Set author
        if (author) {
            embed.setAuthor({ name: author });
        }

        // Set URL
        if (url) {
            if (!isValidUrl(url)) {
                return interaction.reply({
                    content: 'Invalid URL. Please provide a valid URL.',
                    ephemeral: true
                });
            }
            embed.setURL(url);
        }

        // Set timestamp
        if (timestamp) {
            embed.setTimestamp();
        }

        // Send the embed
        try {
            await interaction.channel.send({ embeds: [embed] });
            return interaction.reply({
                content: 'Embed created successfully!',
                ephemeral: true
            });
        } catch (error) {
            console.error('[ERROR] Failed to send embed:', error);
            return interaction.reply({
                content: 'Failed to create the embed. Please check your inputs and try again.',
                ephemeral: true
            });
        }
    }
};

/**
 * Validates a URL string
 * @param {string} string - The string to validate
 * @returns {boolean} Whether the string is a valid URL
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (error) {
        return false;
    }
}
