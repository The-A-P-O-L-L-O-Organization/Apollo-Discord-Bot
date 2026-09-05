import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, Attachment } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error markdownParser.js not yet migrated
import { parseMarkdownToEmbed } from '../../../utils/markdownParser.js';
// @ts-expect-error automod.js not yet migrated
import { getAutomodConfig, checkBannedWords } from '../../../utils/automod.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

function isValidUrl(string: string): boolean {
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

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
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
            const fileAttachment = interaction.options.getAttachment('file') as Attachment | null;

            let parsed: Record<string, unknown> = {};
            if (fileAttachment) {
                if (!fileAttachment.name.toLowerCase().endsWith('.md')) {
                    await interaction.reply({
                        content: 'Only `.md` files are supported. Please upload a markdown file.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                try {
                    const response = await fetch(fileAttachment.url);
                    const content = await response.text();
                    if (!content.trim()) {
                        await interaction.reply({
                            content: 'The uploaded .md file is empty.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    // @ts-expect-error markdownParser.js not yet migrated
                    parsed = parseMarkdownToEmbed(content, fileAttachment.name, { title, description }) as Record<string, unknown>;
                } catch {
                    await interaction.reply({
                        content: 'Could not read the attached file. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            if (!title && !description && !fileAttachment) {
                await interaction.reply({
                    content: 'You must provide at least a title or description for the embed.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder();

            if (title) {
                embed.setTitle(title);
            } else if (parsed.title) {
                embed.setTitle(parsed.title as string);
            }

            if (description) {
                embed.setDescription(description);
            } else if (parsed.description) {
                embed.setDescription(parsed.description as string);
            }

            if (color) {
                const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
                const match = color.match(hexRegex);
                if (match) {
                    embed.setColor(`#${match[1]}`);
                } else {
                    await interaction.reply({
                        content: 'Invalid color format. Please use a hex color code (e.g., #FF0000 or FF0000).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            } else {
                embed.setColor('#3498DB');
            }

            if (image) {
                if (!isValidUrl(image)) {
                    await interaction.reply({
                        content: 'Invalid image URL. Please provide a valid URL.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                embed.setImage(image);
            }

            if (thumbnail) {
                if (!isValidUrl(thumbnail)) {
                    await interaction.reply({
                        content: 'Invalid thumbnail URL. Please provide a valid URL.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
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
                    await interaction.reply({
                        content: 'Invalid URL. Please provide a valid URL.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                embed.setURL(url);
            }

            if (timestamp) {
                embed.setTimestamp();
            }

            if (parsed.fields) {
                for (const field of parsed.fields as Array<{ name: string; value: string; inline?: boolean }>) {
                    embed.addFields(field);
                }
            }
            if (parsed.footer && !footer) {
                // @ts-expect-error parsed.footer type
                embed.setFooter(parsed.footer);
            }

            const cfg = await getAutomodConfig(interaction.guild!.id);
            if (cfg.enabled && cfg.bannedWords.length > 0) {
                const embedTexts: string[] = [];
                if (title) { embedTexts.push(title); } else if (parsed.title) { embedTexts.push(parsed.title as string); }
                if (description) { embedTexts.push(description); } else if (parsed.description) { embedTexts.push(parsed.description as string); }
                if (footer) { embedTexts.push(footer); }
                if (author) { embedTexts.push(author); }
                if (parsed.fields) {
                    for (const field of parsed.fields as Array<{ name: string; value: string }>) {
                        embedTexts.push(field.name);
                        embedTexts.push(field.value);
                    }
                }
                const matchedWord = checkBannedWords(embedTexts.join(' '), cfg.bannedWords);
                if (matchedWord) {
                    await interaction.reply({
                        content: 'Your embed contains a banned word and cannot be sent.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            try {
                await interaction.channel?.send({ embeds: [embed] });
                await interaction.reply({
                    content: 'Embed created successfully!',
                    flags: MessageFlags.Ephemeral
                });
                return;
            } catch (error) {
                logger.error({ err: error, msg: '[ERROR] Failed to send embed' });
                await interaction.reply({
                    content: 'Failed to create the embed. Please check your inputs and try again.',
                    flags: MessageFlags.Ephemeral
                });
                return;
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