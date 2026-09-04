import { ChatInputCommandInteraction, MessageFlags, PermissionsBitField, type APIEmbed } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
// @ts-expect-error safeError.js not yet migrated
import { safeError } from '../../../utils/safeError.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

const ALLOWED_EMBED_KEYS = ['title', 'description', 'color', 'fields', 'image', 'thumbnail', 'footer', 'author'] as const;
const MAX_EMBED_JSON_LENGTH = 2048;

function sanitizeEmbedData(embedData: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const key of ALLOWED_EMBED_KEYS) {
        if (embedData[key] !== undefined) {
            clean[key] = embedData[key];
        }
    }
    return clean;
}

export default {
    // Tag Command
    // Create and manage custom text commands
    name: 'tag',
    description: 'Create and manage custom text commands',
    category: 'Utility',
    dmPermission: false,
    options: [
        {
            name: 'create',
            description: 'Create a new tag',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'name',
                    description: 'Tag name (without prefix)',
                    type: 3, // STRING
                    required: true
                },
                {
                    name: 'content',
                    description: 'Tag content',
                    type: 3, // STRING
                    required: true
                },
                {
                    name: 'embed',
                    description: 'Optional embed JSON (title, description, color, fields)',
                    type: 3, // STRING
                    required: false
                }
            ]
        },
        {
            name: 'show',
            description: 'Show a tag',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'name',
                    description: 'Tag name',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'delete',
            description: 'Delete a tag',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'name',
                    description: 'Tag name',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'list',
            description: 'List all tags',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'info',
            description: 'Get info about a tag',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'name',
                    description: 'Tag name',
                    type: 3, // STRING
                    required: true
                }
            ]
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            try {
                const subcommand = interaction.options.getSubcommand();

                if (subcommand === 'create') {
                    await handleCreate(interaction);
                } else if (subcommand === 'show') {
                    await handleShow(interaction);
                } else if (subcommand === 'delete') {
                    await handleDelete(interaction);
                } else if (subcommand === 'list') {
                    await handleList(interaction);
                } else if (subcommand === 'info') {
                    await handleInfo(interaction);
                }

            } catch (error) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: 'An error occurred.',
                    fields: [
                        {
                            name: '[ERROR] Details',
                            value: safeError(error),
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString('name')?.toLowerCase() ?? '';
    const content = interaction.options.getString('content') ?? '';
    const embedJson = interaction.options.getString('embed');

    // Check permissions
    const permissions = interaction.member?.permissions;
    if (!permissions || typeof permissions === 'string' || !permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Permission Required',
                description: 'You need Manage Messages permission to create tags.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Check tag length
    if (name.length > 30) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Name Too Long',
                description: 'Tag name must be 30 characters or less.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Check content length
    if (content.length > 2000) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Content Too Long',
                description: 'Tag content must be 2000 characters or less.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Parse optional embed JSON
    let embedData: Record<string, unknown> | null = null;
    if (embedJson) {
        try {
            embedData = JSON.parse(embedJson) as Record<string, unknown>;
            if (typeof embedData !== 'object' || embedData === null) {
                throw new Error('Embed must be a JSON object');
            }
            if (embedJson.length > MAX_EMBED_JSON_LENGTH) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Embed Too Large',
                        description: 'Embed JSON must be 2KB or less.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            embedData = sanitizeEmbedData(embedData);
        } catch (error) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Embed JSON',
                    description: `Could not parse embed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    // Check if tag exists
    const tags = (await getGuildData('tags', interaction.guild!.id)) as Record<string, unknown> | null;
    if (tags && tags[name]) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Exists',
                description: `Tag "${name}" already exists. Delete it first.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Create tag
    const tagData = {
        name,
        content,
        embed: embedData,
        createdBy: interaction.user.id,
        createdByTag: interaction.user.tag,
        createdAt: Date.now(),
        usageCount: 0
    };

    await setGuildData('tags', interaction.guild!.id, {
        ...(tags || {}),
        [name]: tagData
    });

    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Tag Created',
        description: `Tag "${name}" has been created!`,
        fields: [
            {
                name: '[INFO] Usage',
                value: `Use /tag show ${name} to display this tag`,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

async function handleShow(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString('name')?.toLowerCase() ?? '';

    const tags = (await getGuildData('tags', interaction.guild!.id)) as Record<string, unknown> | null;

    if (!tags || !tags[name]) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Not Found',
                description: `Tag "${name}" does not exist.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const tag = tags[name] as { content: string; embed?: Record<string, unknown>; usageCount?: number };

    // Increment usage count
    tag.usageCount = (tag.usageCount ?? 0) + 1;
    await setGuildData('tags', interaction.guild!.id, tags);

    const renderedContent = renderTagContent(tag.content, interaction);

    const messagePayload: { content: string; embeds?: APIEmbed[] } = { content: renderedContent };

    if (tag.embed) {
        messagePayload.embeds = [buildTagEmbed(tag.embed) as APIEmbed];
    }

    await interaction.reply(messagePayload);
}

function renderTagContent(content: string, interaction: ChatInputCommandInteraction): string {
    const now = new Date();
    const channel = interaction.channel;
    const variables: Record<string, string> = {
        '{user}': `<@${interaction.user.id}>`,
        '{username}': interaction.user.username,
        '{server}': interaction.guild?.name ?? 'this server',
        '{channel}': channel ? `<#${channel.id}>` : 'unknown-channel',
        '{channelname}': channel && 'name' in channel ? channel.name ?? 'channel' : 'channel',
        '{date}': now.toLocaleDateString(),
        '{time}': now.toLocaleTimeString(),
        '{membercount}': String(interaction.guild?.memberCount ?? 0),
        '{userid}': interaction.user.id
    };

    return Object.entries(variables).reduce(
        (result, [key, value]) => result.split(key).join(String(value)),
        content
    );
}

function buildTagEmbed(embedData: Record<string, unknown>): Record<string, unknown> {
    const embed: Record<string, unknown> = {
        title: embedData['title'],
        description: embedData['description'],
        fields: Array.isArray(embedData['fields']) ? embedData['fields'] : undefined
    };

    if (embedData['color']) {
        const colorStr = String(embedData['color']).replace('#', '');
        embed['color'] = /^[0-9a-fA-F]{6}$/.test(colorStr) ? parseInt(colorStr, 16) : embedData['color'];
    }

    if (embedData['image']) {
        embed['image'] = { url: embedData['image'] };
    }

    if (embedData['thumbnail']) {
        embed['thumbnail'] = { url: embedData['thumbnail'] };
    }

    if (embedData['footer']) {
        embed['footer'] = { text: String(embedData['footer']) };
    }

    if (embedData['author']) {
        embed['author'] = { name: String(embedData['author']) };
    }

    // Clean up undefined properties
    Object.keys(embed).forEach(key => {
        if (embed[key] === undefined) {
            delete embed[key];
        }
    });

    return embed;
}

async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString('name')?.toLowerCase() ?? '';

    // Check permissions
    const permissions = interaction.member?.permissions;
    if (!permissions || typeof permissions === 'string' || !permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Permission Required',
                description: 'You need Manage Messages permission to delete tags.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const tags = (await getGuildData('tags', interaction.guild!.id)) as Record<string, unknown> | null;

    if (!tags || !tags[name]) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Not Found',
                description: `Tag "${name}" does not exist.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    delete tags[name];
    await setGuildData('tags', interaction.guild!.id, tags);

    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Tag Deleted',
        description: `Tag "${name}" has been deleted.`,
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
    const tags = (await getGuildData('tags', interaction.guild!.id)) as Record<string, unknown> | null;

    if (!tags || Object.keys(tags).length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Tags',
                description: 'No custom tags have been created yet.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const tagList = Object.values(tags) as Array<{ name: string; content: string; usageCount?: number }>;
    const listEmbed = {
        color: 0x3498DB,
        title: '[TAGS] Custom Commands',
        description: `Total: ${tagList.length}`,
        fields: tagList.slice(0, 10).map(tag => ({
            name: tag.name,
            value: `${tag.content.substring(0, 50)}${tag.content.length > 50 ? '...' : ''}\nUsed ${tag.usageCount ?? 0} times`,
            inline: false
        })),
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [listEmbed], flags: MessageFlags.Ephemeral });
}

async function handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString('name')?.toLowerCase() ?? '';

    const tags = (await getGuildData('tags', interaction.guild!.id)) as Record<string, unknown> | null;

    if (!tags || !tags[name]) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Not Found',
                description: `Tag "${name}" does not exist.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const tag = tags[name] as { name: string; content: string; createdByTag: string; createdAt: number; usageCount: number };

    const infoEmbed = {
        color: 0x3498DB,
        title: `[TAG] ${tag.name}`,
        fields: [
            {
                name: '[INFO] Content',
                value: tag.content,
                inline: false
            },
            {
                name: '[INFO] Created By',
                value: tag.createdByTag,
                inline: true
            },
            {
                name: '[INFO] Created At',
                value: `<t:${Math.floor(tag.createdAt / 1000)}:F>`,
                inline: true
            },
            {
                name: '[INFO] Usage Count',
                value: `${tag.usageCount} times`,
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [infoEmbed], flags: MessageFlags.Ephemeral });
}