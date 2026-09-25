import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { parseMarkdownToEmbed } from '../../../utils/markdownParser.js';
import { getAutomodConfig, checkBannedWords } from '../../../utils/automod.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
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

            let parsed: Record<string, unknown> = {};
            if (fileAttachment) {
                if (!fileAttachment.name.toLowerCase().endsWith('.md')) {
                    await interaction.reply({
                        content: t('embed.onlyMd'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                try {
                    const response = await fetch(fileAttachment.url);
                    const content = await response.text();
                    if (!content.trim()) {
                        await interaction.reply({
                            content: t('embed.emptyFile'),
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    // @ts-expect-error markdownParser.js not yet migrated
                    parsed = parseMarkdownToEmbed(content, fileAttachment.name, { title, description }) as Record<string, unknown>;
                } catch {
                    await interaction.reply({
                        content: t('embed.readFailed'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            if (!title && !description && !fileAttachment) {
                await interaction.reply({
                    content: t('embed.needTitleOrDesc'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder();

            if (title) {
                embed.setTitle(title);
            } else if (parsed['title']) {
                embed.setTitle(parsed['title'] as string);
            }

            if (description) {
                embed.setDescription(description);
            } else if (parsed['description']) {
                embed.setDescription(parsed['description'] as string);
            }

            if (color) {
                const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
                const match = hexRegex.exec(color);
                if (match) {
                    embed.setColor(`#${match[1]}`);
                } else {
                    await interaction.reply({
                        content: t('embed.badColor'),
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
                        content: t('embed.badImage'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                embed.setImage(image);
            }

            if (thumbnail) {
                if (!isValidUrl(thumbnail)) {
                    await interaction.reply({
                        content: t('embed.badThumb'),
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
                        content: t('embed.badUrl'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                embed.setURL(url);
            }

            if (timestamp) {
                embed.setTimestamp();
            }

            if (parsed['fields']) {
                for (const field of parsed['fields'] as { name: string; value: string; inline?: boolean }[]) {
                    embed.addFields(field);
                }
            }
            if (parsed['footer'] && !footer) {
                // @ts-expect-error parsed.footer type
                embed.setFooter(parsed.footer);
            }

            const cfg = await getAutomodConfig(interaction.guild!.id);
            if (cfg.enabled && cfg.bannedWords.length > 0) {
                const embedTexts: string[] = [];
                if (title) { embedTexts.push(title); } else if (parsed['title']) { embedTexts.push(parsed['title'] as string); }
                if (description) { embedTexts.push(description); } else if (parsed['description']) { embedTexts.push(parsed['description'] as string); }
                if (footer) { embedTexts.push(footer); }
                if (author) { embedTexts.push(author); }
                if (parsed['fields']) {
                    for (const field of parsed['fields'] as { name: string; value: string }[]) {
                        embedTexts.push(field.name);
                        embedTexts.push(field.value);
                    }
                }
                const matchedWord = checkBannedWords(embedTexts.join(' '), cfg.bannedWords);
                if (matchedWord) {
                    await interaction.reply({
                        content: t('embed.banned'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            try {
                const targetChannel = interaction.channel;
                if (targetChannel && 'send' in targetChannel) {
                    await targetChannel.send({ embeds: [embed] });
                }
                await interaction.reply({
                    content: t('embed.created'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            } catch (error) {
                logger.error({ err: error, msg: '[ERROR] Failed to send embed' });
                await interaction.reply({
                    content: t('embed.failed'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

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