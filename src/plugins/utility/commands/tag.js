// Tag Command
// Create and manage custom text commands

import { PermissionsBitField } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';

export default {
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
    
    async execute(interaction) {
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
            console.error('[ERROR] Tag command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

async function handleCreate(interaction) {
    const name = interaction.options.getString('name').toLowerCase();
    const content = interaction.options.getString('content');
    const embedJson = interaction.options.getString('embed');
    
    // Check permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Permission Required',
                description: 'You need Manage Messages permission to create tags.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Check tag length
    if (name.length > 30) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Name Too Long',
                description: 'Tag name must be 30 characters or less.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Check content length
    if (content.length > 2000) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Content Too Long',
                description: 'Tag content must be 2000 characters or less.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Parse optional embed JSON
    let embedData = null;
    if (embedJson) {
        try {
            embedData = JSON.parse(embedJson);
            if (typeof embedData !== 'object' || embedData === null) {
                throw new Error('Embed must be a JSON object');
            }
        } catch (error) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Embed JSON',
                    description: `Could not parse embed: ${error.message}`,
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }
    }
    
    // Check if tag exists
    const tags = await getGuildData('tags', interaction.guild.id);
    if (tags && tags[name]) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Exists',
                description: `Tag "${name}" already exists. Delete it first.`,
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    // Create tag
    const tagData = {
        name: name,
        content: content,
        embed: embedData,
        createdBy: interaction.user.id,
        createdByTag: interaction.user.tag,
        createdAt: Date.now(),
        usageCount: 0
    };
    
    await setGuildData('tags', interaction.guild.id, {
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
    
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
}

async function handleShow(interaction) {
    const name = interaction.options.getString('name').toLowerCase();
    
    const tags = await getGuildData('tags', interaction.guild.id);
    
    if (!tags || !tags[name]) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Not Found',
                description: `Tag "${name}" does not exist.`,
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    const tag = tags[name];
    
    // Increment usage count
    tag.usageCount = (tag.usageCount || 0) + 1;
    await setGuildData('tags', interaction.guild.id, tags);
    
    const content = renderTagContent(tag.content, interaction);
    
    const messagePayload = { content };
    
    if (tag.embed) {
        messagePayload.embeds = [buildTagEmbed(tag.embed)];
    }
    
    await interaction.reply(messagePayload);
}

function renderTagContent(content, interaction) {
    const now = new Date();
    const variables = {
        '{user}': `<@${interaction.user.id}>`,
        '{username}': interaction.user.username,
        '{server}': interaction.guild?.name || 'this server',
        '{channel}': `<#${interaction.channel.id}>`,
        '{channelname}': interaction.channel.name || 'channel',
        '{date}': now.toLocaleDateString(),
        '{time}': now.toLocaleTimeString(),
        '{membercount}': interaction.guild?.memberCount || 0,
        '{userid}': interaction.user.id
    };
    
    return Object.entries(variables).reduce(
        (result, [key, value]) => result.split(key).join(String(value)),
        content
    );
}

function buildTagEmbed(embedData) {
    const embed = {
        title: embedData.title,
        description: embedData.description,
        fields: Array.isArray(embedData.fields) ? embedData.fields : undefined
    };
    
    if (embedData.color) {
        const colorStr = String(embedData.color).replace('#', '');
        embed.color = /^[0-9a-fA-F]{6}$/.test(colorStr) ? parseInt(colorStr, 16) : embedData.color;
    }
    
    if (embedData.image) {
        embed.image = { url: embedData.image };
    }
    
    if (embedData.thumbnail) {
        embed.thumbnail = { url: embedData.thumbnail };
    }
    
    if (embedData.footer) {
        embed.footer = { text: String(embedData.footer) };
    }
    
    if (embedData.author) {
        embed.author = { name: String(embedData.author) };
    }
    
    // Clean up undefined properties
    Object.keys(embed).forEach(key => {
        if (embed[key] === undefined) {
            delete embed[key];
        }
    });
    
    return embed;
}

async function handleDelete(interaction) {
    const name = interaction.options.getString('name').toLowerCase();
    
    // Check permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Permission Required',
                description: 'You need Manage Messages permission to delete tags.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    const tags = await getGuildData('tags', interaction.guild.id);
    
    if (!tags || !tags[name]) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Not Found',
                description: `Tag "${name}" does not exist.`,
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    delete tags[name];
    await setGuildData('tags', interaction.guild.id, tags);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Tag Deleted',
        description: `Tag "${name}" has been deleted.`,
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
}

async function handleList(interaction) {
    const tags = await getGuildData('tags', interaction.guild.id);
    
    if (!tags || Object.keys(tags).length === 0) {
        return interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Tags',
                description: 'No custom tags have been created yet.',
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    const tagList = Object.values(tags);
    const listEmbed = {
        color: 0x3498DB,
        title: '[TAGS] Custom Commands',
        description: `Total: ${tagList.length}`,
        fields: tagList.slice(0, 10).map(tag => ({
            name: tag.name,
            value: `${tag.content.substring(0, 50)}${tag.content.length > 50 ? '...' : ''}\nUsed ${tag.usageCount} times`,
            inline: false
        })),
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [listEmbed], ephemeral: true });
}

async function handleInfo(interaction) {
    const name = interaction.options.getString('name').toLowerCase();
    
    const tags = await getGuildData('tags', interaction.guild.id);
    
    if (!tags || !tags[name]) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Tag Not Found',
                description: `Tag "${name}" does not exist.`,
                timestamp: new Date().toISOString()
            }],
            ephemeral: true
        });
    }
    
    const tag = tags[name];
    
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
    
    await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
}
