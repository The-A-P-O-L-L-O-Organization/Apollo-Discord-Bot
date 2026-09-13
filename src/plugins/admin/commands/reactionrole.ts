import { PermissionFlagsBits, EmbedBuilder, ChatInputCommandInteraction, MessageFlags, Role, type Channel, type GuildBasedChannel } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface EmojiData {
    identifier: string;
    display: string;
    reaction: string;
    isCustom: boolean;
    animated: boolean;
}

function parseEmoji(input: string): EmojiData | null {
    input = input.trim();

    const customMatch = input.match(/^<(a?):(\w+):(\d+)>$/);
    if (customMatch) {
        const animated = customMatch[1] === 'a';
        const name = customMatch[2]!;
        const id = customMatch[3]!;
        return {
            identifier: `${name}:${id}`,
            display: input,
            reaction: id,
            isCustom: true,
            animated
        };
    }

    if (/^\d+$/.test(input)) {
        return {
            identifier: input,
            display: `<:emoji:${input}>`,
            reaction: input,
            isCustom: true,
            animated: false
        };
    }

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

interface ReactionRole {
    messageId: string;
    channelId: string;
    emoji: string;
    emojiDisplay: string;
    roleId: string;
    createdAt: number;
}

export default {
    name: 'reactionrole',
    description: 'Manage reaction roles for the server',
    category: 'admin',
    dmPermission: false,
    canQueue: false,
    options: [
        {
            name: 'add',
            description: 'Add a reaction role to a message',
            type: 1,
            options: [
                {
                    name: 'message_id',
                    description: 'The ID of the message to add the reaction role to',
                    type: 3,
                    required: true
                },
                {
                    name: 'emoji',
                    description: 'The emoji to react with (use emoji or emoji ID for custom)',
                    type: 3,
                    required: true
                },
                {
                    name: 'role',
                    description: 'The role to give when the emoji is reacted',
                    type: 8,
                    required: true
                },
                {
                    name: 'channel',
                    description: 'The channel the message is in (defaults to current channel)',
                    type: 7,
                    required: false
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a reaction role from a message',
            type: 1,
            options: [
                {
                    name: 'message_id',
                    description: 'The ID of the message',
                    type: 3,
                    required: true
                },
                {
                    name: 'emoji',
                    description: 'The emoji to remove',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'list',
            description: 'List all reaction roles in this server',
            type: 1
        },
        {
            name: 'clear',
            description: 'Clear all reaction roles from a message',
            type: 1,
            options: [
                {
                    name: 'message_id',
                    description: 'The ID of the message to clear reaction roles from',
                    type: 3,
                    required: true
                }
            ]
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild!.id;

            if (subcommand === 'add') {
                const messageId = interaction.options.getString('message_id');
                const emojiInput = interaction.options.getString('emoji');
                const role = interaction.options.getRole('role');
                const channel = interaction.options.getChannel('channel') || interaction.channel;

                if (!role) {
                    return interaction.reply({
                        content: 'Role not found.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const botMember = interaction.guild!.members.me;
                if (!botMember || role.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        content: 'I cannot assign this role because it is higher than or equal to my highest role.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (role.id === interaction.guild!.id) {
                    return interaction.reply({
                        content: 'You cannot use the @everyone role for reaction roles.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!channel || !('isTextBased' in channel) || !channel.isTextBased()) {
                    return interaction.reply({
                        content: 'Invalid channel.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const textChannel = channel as { messages: { fetch: (id: string) => Promise<unknown> } };
                let message: { react: (emoji: string) => Promise<void>; url: string };
                try {
                    message = await textChannel.messages.fetch(messageId!) as { react: (emoji: string) => Promise<void>; url: string };
                } catch {
                    return interaction.reply({
                        content: `Could not find a message with ID \`${messageId}\` in ${channel}.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const emoji = parseEmoji(emojiInput!);
                if (!emoji) {
                    return interaction.reply({
                        content: 'Invalid emoji. Please use a standard emoji or a custom emoji from this server.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                try {
                    await message.react(emoji.reaction);
                } catch {
                    return interaction.reply({
                        content: 'Failed to react to the message. Make sure I have permission to add reactions and the emoji is valid.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const reactionRoles = await getGuildData('reactionroles', guildId) as Record<string, unknown>;
                const rolesArray = (reactionRoles['roles'] as Array<Record<string, unknown>>) ?? [];
                reactionRoles['roles'] = rolesArray;

                const existingIndex = rolesArray.findIndex(
                    (rr: Record<string, unknown>) => rr['messageId'] === messageId && rr['emoji'] === emoji.identifier
                );

                if (existingIndex !== -1 && existingIndex < rolesArray.length) {
                    (rolesArray[existingIndex] as Record<string, unknown>)['roleId'] = role.id;
                } else {
                    rolesArray.push({
                        messageId: messageId!,
                        channelId: channel.id,
                        emoji: emoji.identifier,
                        emojiDisplay: emoji.display,
                        roleId: role.id,
                        createdAt: Date.now()
                    });
                }

                await setGuildData('reactionroles', guildId, reactionRoles);

                return interaction.reply({
                    content: `Reaction role added! Users who react with ${emoji.display} on [this message](${message.url}) will receive the ${role} role.`,
                    flags: MessageFlags.Ephemeral
                });

            } else if (subcommand === 'remove') {
                const messageId = interaction.options.getString('message_id');
                const emojiInput = interaction.options.getString('emoji');

                const emoji = parseEmoji(emojiInput!);
                if (!emoji) {
                    return interaction.reply({
                        content: 'Invalid emoji format.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const reactionRoles = await getGuildData('reactionroles', guildId) as Record<string, unknown>;
                const rolesArray = (reactionRoles['roles'] as Array<Record<string, unknown>>) ?? [];
                reactionRoles['roles'] = rolesArray;

                if (!rolesArray || rolesArray.length === 0) {
                    return interaction.reply({
                        content: 'No reaction roles are configured in this server.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const index = rolesArray.findIndex(
                    (rr: Record<string, unknown>) => rr['messageId'] === messageId && rr['emoji'] === emoji.identifier
                );

                if (index === -1) {
                    return interaction.reply({
                        content: 'No reaction role found for that message and emoji combination.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const removed = rolesArray.splice(index, 1)[0];
                await setGuildData('reactionroles', guildId, reactionRoles);

                try {
                    const fetchChannel = await interaction.guild!.channels.fetch((removed as Record<string, unknown>)['channelId'] as string);
                    if (fetchChannel && fetchChannel.isTextBased()) {
                        const message = await fetchChannel.messages.fetch(messageId!);
                        await message.reactions.cache.get(emoji.identifier)?.users.remove(interaction.client.user!.id);
                    }
                } catch {
                    // Ignore errors
                }

                return interaction.reply({
                    content: `Reaction role removed for ${emoji.display}.`,
                    flags: MessageFlags.Ephemeral
                });

            } else if (subcommand === 'list') {
                const reactionRoles = await getGuildData('reactionroles', guildId) as Record<string, unknown>;
                const rolesArray = (reactionRoles['roles'] as Array<Record<string, unknown>>) ?? [];

                if (!rolesArray || rolesArray.length === 0) {
                    return interaction.reply({
                        content: 'No reaction roles are configured in this server.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Reaction Roles')
                    .setDescription(`${rolesArray.length} reaction role(s) configured`)
                    .setTimestamp();

                const grouped: Record<string, { channelId: string; messageId: string; roles: ReactionRole[] }> = {};
                for (const rr of rolesArray) {
                    const key = `${rr['channelId']}-${rr['messageId']}`;
                    if (!grouped[key]) {
                        grouped[key] = {
                            channelId: rr['channelId'] as string,
                            messageId: rr['messageId'] as string,
                            roles: []
                        };
                    }
                    grouped[key].roles.push(rr as unknown as ReactionRole);
                }

                for (const [, group] of Object.entries(grouped)) {
                    const roleList = group.roles
                        .map(rr => `${rr.emojiDisplay} → <@&${rr.roleId}>`)
                        .join('\n');

                    embed.addFields({
                        name: `Message in <#${group.channelId}>`,
                        value: `[Jump to message](https://discord.com/channels/${guildId}/${group.channelId}/${group.messageId})\n${roleList}`,
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (subcommand === 'clear') {
                const messageId = interaction.options.getString('message_id');

                const reactionRoles = await getGuildData('reactionroles', guildId) as Record<string, unknown>;
                const rolesArray = (reactionRoles['roles'] as Array<Record<string, unknown>>) ?? [];

                if (!rolesArray || rolesArray.length === 0) {
                    return interaction.reply({
                        content: 'No reaction roles are configured in this server.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const toRemove = rolesArray.filter((rr: Record<string, unknown>) => rr['messageId'] === messageId);
                if (toRemove.length === 0) {
                    return interaction.reply({
                        content: 'No reaction roles found for that message.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                reactionRoles['roles'] = rolesArray.filter((rr: Record<string, unknown>) => rr['messageId'] !== messageId);
                await setGuildData('reactionroles', guildId, reactionRoles);

                if (toRemove.length > 0 && toRemove[0]) {
                    try {
                        const channel = await interaction.guild!.channels.fetch((toRemove[0] as Record<string, unknown>)['channelId'] as string);
                        if (channel && channel.isTextBased()) {
                            const message = await channel.messages.fetch(messageId!);
                            for (const rr of toRemove) {
                                await message.reactions.cache.get(rr['emoji'] as string)?.users.remove(interaction.client.user!.id);
                            }
                        }
                    } catch {
                        // Ignore errors
                    }
                }

                return interaction.reply({
                    content: `Cleared ${toRemove.length} reaction role(s) from that message.`,
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unexpected error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};