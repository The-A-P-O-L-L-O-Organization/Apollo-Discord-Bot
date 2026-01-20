// Reaction Role Command
// Allows admins to set up reaction roles on messages

import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/dataStore.js';

export default {
    name: 'reactionrole',
    description: 'Manage reaction roles',
    category: 'admin',
    defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
    dmPermission: false,
    options: [
        {
            name: 'add',
            description: 'Add a reaction role to a message',
            type: 1, // SUB_COMMAND type
            options: [
                {
                    name: 'message_id',
                    description: 'The ID of the message to add the reaction role to',
                    type: 3, // STRING type
                    required: true
                },
                {
                    name: 'emoji',
                    description: 'The emoji to react with (use emoji or emoji ID for custom)',
                    type: 3, // STRING type
                    required: true
                },
                {
                    name: 'role',
                    description: 'The role to give when the emoji is reacted',
                    type: 8, // ROLE type
                    required: true
                },
                {
                    name: 'channel',
                    description: 'The channel the message is in (defaults to current channel)',
                    type: 7, // CHANNEL type
                    required: false
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a reaction role from a message',
            type: 1, // SUB_COMMAND type
            options: [
                {
                    name: 'message_id',
                    description: 'The ID of the message',
                    type: 3, // STRING type
                    required: true
                },
                {
                    name: 'emoji',
                    description: 'The emoji to remove',
                    type: 3, // STRING type
                    required: true
                }
            ]
        },
        {
            name: 'list',
            description: 'List all reaction roles in this server',
            type: 1 // SUB_COMMAND type
        },
        {
            name: 'clear',
            description: 'Clear all reaction roles from a message',
            type: 1, // SUB_COMMAND type
            options: [
                {
                    name: 'message_id',
                    description: 'The ID of the message to clear reaction roles from',
                    type: 3, // STRING type
                    required: true
                }
            ]
        }
    ],

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'add') {
            const messageId = interaction.options.getString('message_id');
            const emojiInput = interaction.options.getString('emoji');
            const role = interaction.options.getRole('role');
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            // Check if bot can manage the role
            const botMember = interaction.guild.members.me;
            if (role.position >= botMember.roles.highest.position) {
                return interaction.reply({
                    content: 'I cannot assign this role because it is higher than or equal to my highest role.',
                    ephemeral: true
                });
            }

            // Check if role is @everyone
            if (role.id === interaction.guild.id) {
                return interaction.reply({
                    content: 'You cannot use the @everyone role for reaction roles.',
                    ephemeral: true
                });
            }

            // Try to fetch the message
            let message;
            try {
                message = await channel.messages.fetch(messageId);
            } catch (error) {
                return interaction.reply({
                    content: `Could not find a message with ID \`${messageId}\` in ${channel}.`,
                    ephemeral: true
                });
            }

            // Parse the emoji
            const emoji = parseEmoji(emojiInput);
            if (!emoji) {
                return interaction.reply({
                    content: 'Invalid emoji. Please use a standard emoji or a custom emoji from this server.',
                    ephemeral: true
                });
            }

            // Add the reaction to the message
            try {
                await message.react(emoji.reaction);
            } catch (error) {
                return interaction.reply({
                    content: `Failed to react to the message. Make sure I have permission to add reactions and the emoji is valid.`,
                    ephemeral: true
                });
            }

            // Save the reaction role configuration
            const reactionRoles = getGuildData('reactionroles', guildId);
            if (!reactionRoles.roles) {
                reactionRoles.roles = [];
            }

            // Check if this combo already exists
            const existingIndex = reactionRoles.roles.findIndex(
                rr => rr.messageId === messageId && rr.emoji === emoji.identifier
            );

            if (existingIndex !== -1) {
                // Update existing
                reactionRoles.roles[existingIndex].roleId = role.id;
            } else {
                // Add new
                reactionRoles.roles.push({
                    messageId,
                    channelId: channel.id,
                    emoji: emoji.identifier,
                    emojiDisplay: emoji.display,
                    roleId: role.id,
                    createdAt: Date.now()
                });
            }

            setGuildData('reactionroles', guildId, reactionRoles);

            return interaction.reply({
                content: `Reaction role added! Users who react with ${emoji.display} on [this message](${message.url}) will receive the ${role} role.`,
                ephemeral: true
            });

        } else if (subcommand === 'remove') {
            const messageId = interaction.options.getString('message_id');
            const emojiInput = interaction.options.getString('emoji');

            const emoji = parseEmoji(emojiInput);
            if (!emoji) {
                return interaction.reply({
                    content: 'Invalid emoji format.',
                    ephemeral: true
                });
            }

            const reactionRoles = getGuildData('reactionroles', guildId);
            if (!reactionRoles.roles || reactionRoles.roles.length === 0) {
                return interaction.reply({
                    content: 'No reaction roles are configured in this server.',
                    ephemeral: true
                });
            }

            const index = reactionRoles.roles.findIndex(
                rr => rr.messageId === messageId && rr.emoji === emoji.identifier
            );

            if (index === -1) {
                return interaction.reply({
                    content: 'No reaction role found for that message and emoji combination.',
                    ephemeral: true
                });
            }

            const removed = reactionRoles.roles.splice(index, 1)[0];
            setGuildData('reactionroles', guildId, reactionRoles);

            // Try to remove the bot's reaction
            try {
                const channel = await interaction.guild.channels.fetch(removed.channelId);
                const message = await channel.messages.fetch(messageId);
                await message.reactions.cache.get(emoji.identifier)?.users.remove(interaction.client.user.id);
            } catch (error) {
                // Ignore - message may have been deleted
            }

            return interaction.reply({
                content: `Reaction role removed for ${emoji.display}.`,
                ephemeral: true
            });

        } else if (subcommand === 'list') {
            const reactionRoles = getGuildData('reactionroles', guildId);

            if (!reactionRoles.roles || reactionRoles.roles.length === 0) {
                return interaction.reply({
                    content: 'No reaction roles are configured in this server.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Reaction Roles')
                .setDescription(`${reactionRoles.roles.length} reaction role(s) configured`)
                .setTimestamp();

            // Group by message
            const grouped = {};
            for (const rr of reactionRoles.roles) {
                const key = `${rr.channelId}-${rr.messageId}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        channelId: rr.channelId,
                        messageId: rr.messageId,
                        roles: []
                    };
                }
                grouped[key].roles.push(rr);
            }

            for (const [key, group] of Object.entries(grouped)) {
                const roleList = group.roles
                    .map(rr => `${rr.emojiDisplay} → <@&${rr.roleId}>`)
                    .join('\n');
                
                embed.addFields({
                    name: `Message in <#${group.channelId}>`,
                    value: `[Jump to message](https://discord.com/channels/${guildId}/${group.channelId}/${group.messageId})\n${roleList}`,
                    inline: false
                });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'clear') {
            const messageId = interaction.options.getString('message_id');

            const reactionRoles = getGuildData('reactionroles', guildId);
            if (!reactionRoles.roles || reactionRoles.roles.length === 0) {
                return interaction.reply({
                    content: 'No reaction roles are configured in this server.',
                    ephemeral: true
                });
            }

            const toRemove = reactionRoles.roles.filter(rr => rr.messageId === messageId);
            if (toRemove.length === 0) {
                return interaction.reply({
                    content: 'No reaction roles found for that message.',
                    ephemeral: true
                });
            }

            reactionRoles.roles = reactionRoles.roles.filter(rr => rr.messageId !== messageId);
            setGuildData('reactionroles', guildId, reactionRoles);

            // Try to clear bot's reactions from the message
            if (toRemove.length > 0) {
                try {
                    const channel = await interaction.guild.channels.fetch(toRemove[0].channelId);
                    const message = await channel.messages.fetch(messageId);
                    for (const rr of toRemove) {
                        await message.reactions.cache.get(rr.emoji)?.users.remove(interaction.client.user.id);
                    }
                } catch (error) {
                    // Ignore - message may have been deleted
                }
            }

            return interaction.reply({
                content: `Cleared ${toRemove.length} reaction role(s) from that message.`,
                ephemeral: true
            });
        }
    }
};

/**
 * Parses an emoji input string into a usable format
 * @param {string} input - The emoji input
 * @returns {Object|null} Emoji object with identifier, display, and reaction properties
 */
function parseEmoji(input) {
    // Trim whitespace
    input = input.trim();

    // Check for custom emoji format: <:name:id> or <a:name:id>
    const customMatch = input.match(/^<(a?):(\w+):(\d+)>$/);
    if (customMatch) {
        const animated = customMatch[1] === 'a';
        const name = customMatch[2];
        const id = customMatch[3];
        return {
            identifier: `${name}:${id}`,
            display: input,
            reaction: id,
            isCustom: true,
            animated
        };
    }

    // Check if it's just an emoji ID (for custom emojis)
    if (/^\d+$/.test(input)) {
        return {
            identifier: input,
            display: `<:emoji:${input}>`,
            reaction: input,
            isCustom: true,
            animated: false
        };
    }

    // Assume it's a unicode emoji
    // Basic validation: emojis are typically 1-4 characters but can be longer with modifiers
    if (input.length > 0 && input.length <= 32) {
        return {
            identifier: input,
            display: input,
            reaction: input,
            isCustom: false,
            animated: false
        };
    }

    return null;
}
