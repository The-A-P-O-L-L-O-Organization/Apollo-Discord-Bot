import { logger } from '../../../utils/logger.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { parseMarkdownToEmbed } from '../../../utils/markdownParser.js';
import { getAutomodConfig, checkBannedWords } from '../../../utils/automod.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch {
        return false;
    }
}

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
        .addAttachmentOption(option =>
            option
                .setName('file')
                .setDescription('.md file to render as an embed')
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
    name: 'embed',
    category: 'utility',

    async execute(interaction) {
        try {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const color = interaction.options.getString('color');
            const image = interaction.options.getString('image');
            const thumbnail = interaction.options.getString('thumbnail');
            const footer = interaction.options.getString('footer');
            const author = interaction.options.getString('author');
            const url = interaction.options.getString('url');
            const timestamp = interaction.options.getBoolean('timestamp');
            const fileAttachment = interaction.options.getAttachment('file');

            let parsed = {};
            if (fileAttachment) {
                if (!fileAttachment.name.toLowerCase().endsWith('.md')) {
                    return interaction.reply({
                        content: 'Only `.md` files are supported. Please upload a markdown file.',
                        flags: 64
                    });
                }
                try {
                    const response = await fetch(fileAttachment.url);
                    const content = await response.text();
                    if (!content.trim()) {
                        return interaction.reply({
                            content: 'The uploaded .md file is empty.',
                            flags: 64
                        });
                    }
                    parsed = parseMarkdownToEmbed(content, fileAttachment.name, { title, description });
                } catch {
                    return interaction.reply({
                        content: 'Could not read the attached file. Please try again.',
                        flags: 64
                    });
                }
            }

            if (!title && !description && !fileAttachment) {
                return interaction.reply({
                    content: 'You must provide at least a title or description for the embed.',
                    flags: 64
                });
            }

            const embed = new EmbedBuilder();

            if (title) {
                embed.setTitle(title);
            } else if (parsed.title) {
                embed.setTitle(parsed.title);
            }

            if (description) {
                embed.setDescription(description);
            } else if (parsed.description) {
                embed.setDescription(parsed.description);
            }

            if (color) {
                const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
                const match = color.match(hexRegex);
                if (match) {
                    embed.setColor(`#${match[1]}`);
                } else {
                    return interaction.reply({
                        content: 'Invalid color format. Please use a hex color code (e.g., #FF0000 or FF0000).',
                        flags: 64
                    });
                }
            } else {
                embed.setColor('#3498DB');
            }

            if (image) {
                if (!isValidUrl(image)) {
                    return interaction.reply({
                        content: 'Invalid image URL. Please provide a valid URL.',
                        flags: 64
                    });
                }
                embed.setImage(image);
            }

            if (thumbnail) {
                if (!isValidUrl(thumbnail)) {
                    return interaction.reply({
                        content: 'Invalid thumbnail URL. Please provide a valid URL.',
                        flags: 64
                    });
                }
                embed.setThumbnail(thumbnail);
            }

            if (footer) {
                embed.setFooter({ text: footer });
            }

            if (author) {
                embed.setAuthor({ name: author });
            }

            if (url) {
                if (!isValidUrl(url)) {
                    return interaction.reply({
                        content: 'Invalid URL. Please provide a valid URL.',
                        flags: 64
                    });
                }
                embed.setURL(url);
            }

            if (timestamp) {
                embed.setTimestamp();
            }

            if (parsed.fields) {
                for (const field of parsed.fields) {
                    embed.addFields(field);
                }
            }
            if (parsed.footer && !footer) {
                embed.setFooter(parsed.footer);
            }

            const cfg = await getAutomodConfig(interaction.guild.id);
            if (cfg.enabled && cfg.bannedWords.length > 0) {
                const embedTexts = [];
                if (title) {embedTexts.push(title);} else if (parsed.title) {embedTexts.push(parsed.title);}
                if (description) {embedTexts.push(description);} else if (parsed.description) {embedTexts.push(parsed.description);}
                if (footer) {embedTexts.push(footer);}
                if (author) {embedTexts.push(author);}
                if (parsed.fields) {
                    for (const field of parsed.fields) {
                        embedTexts.push(field.name);
                        embedTexts.push(field.value);
                    }
                }
                const matchedWord = checkBannedWords(embedTexts.join(' '), cfg.bannedWords);
                if (matchedWord) {
                    return interaction.reply({
                        content: 'Your embed contains a banned word and cannot be sent.',
                        flags: 64
                    });
                }
            }

            try {
                await interaction.channel.send({ embeds: [embed] });
                return interaction.reply({
                    content: 'Embed created successfully!',
                    flags: 64
                });
            } catch (error) {
                logger.error('[ERROR] Failed to send embed:', error);
                return interaction.reply({
                    content: 'Failed to create the embed. Please check your inputs and try again.',
                    flags: 64
                });
            }

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