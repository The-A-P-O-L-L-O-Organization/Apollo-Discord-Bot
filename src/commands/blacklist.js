// Blacklist Command
// Manages the server-wide join blacklist (add, remove, view)

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/db.js';
import { sendModLog } from '../utils/modLog.js';

export default {
    name: 'blacklist',
    description: 'Manage the server join blacklist',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'add',
            description: 'Add a user to the server blacklist',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user to blacklist (mention or ID)',
                    type: 6, // USER
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Reason for blacklisting',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a user from the server blacklist',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user to remove from the blacklist (mention or ID)',
                    type: 6, // USER
                    required: true
                }
            ]
        },
        {
            name: 'view',
            description: 'View the current server blacklist',
            type: 1, // SUB_COMMAND
            options: []
        }
    ],

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            await handleAdd(interaction);
        } else if (subcommand === 'remove') {
            await handleRemove(interaction);
        } else if (subcommand === 'view') {
            await handleView(interaction);
        }
    }
};

/**
 * Adds a user to the guild blacklist
 */
async function handleAdd(interaction) {
    try {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        // Prevent blacklisting yourself
        if (user.id === interaction.user.id) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot blacklist yourself.',
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        // Prevent blacklisting the bot
        if (user.id === interaction.client.user.id) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot blacklist the bot.',
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        const guildData = getGuildData('blacklist', interaction.guild.id);
        const entries = guildData.entries || {};

        // Check if already blacklisted
        if (entries[user.id]) {
            return interaction.reply({
                embeds: [{
                    color: 0xFFA500,
                    title: '[WARNING] Already Blacklisted',
                    description: `${user.tag} is already on the blacklist.\nReason: ${entries[user.id].reason}`,
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        // Add to blacklist
        entries[user.id] = {
            userId: user.id,
            userTag: user.tag,
            reason: reason,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            addedAt: Date.now()
        };

        setGuildData('blacklist', interaction.guild.id, { entries });

        const successEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('[SUCCESS] User Blacklisted')
            .setDescription(`${user.tag} has been added to the blacklist.`)
            .addFields(
                { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

        // Send mod log
        await sendModLog(interaction.guild, {
            action: 'blacklist',
            target: user,
            moderator: interaction.user,
            reason: reason
        });

        console.log(`[MODERATION] User ${user.tag} blacklisted by ${interaction.user.tag}. Reason: ${reason}`);

    } catch (error) {
        console.error('[ERROR] Blacklist add error:', error);
        await replyError(interaction, error);
    }
}

/**
 * Removes a user from the guild blacklist
 */
async function handleRemove(interaction) {
    try {
        const user = interaction.options.getUser('user');

        const guildData = getGuildData('blacklist', interaction.guild.id);
        const entries = guildData.entries || {};

        if (!entries[user.id]) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Not Blacklisted',
                    description: `${user.tag} is not on the blacklist.`,
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        const removedEntry = entries[user.id];
        delete entries[user.id];
        setGuildData('blacklist', interaction.guild.id, { entries });

        const successEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('[SUCCESS] User Removed from Blacklist')
            .setDescription(`${user.tag} has been removed from the blacklist.`)
            .addFields(
                { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                { name: 'Removed By', value: interaction.user.tag, inline: true },
                { name: 'Original Reason', value: removedEntry.reason, inline: false }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

        console.log(`[MODERATION] User ${user.tag} removed from blacklist by ${interaction.user.tag}`);

    } catch (error) {
        console.error('[ERROR] Blacklist remove error:', error);
        await replyError(interaction, error);
    }
}

/**
 * Shows all blacklisted users for the guild
 */
async function handleView(interaction) {
    try {
        const guildData = getGuildData('blacklist', interaction.guild.id);
        const entries = guildData.entries || {};
        const list = Object.values(entries);

        if (list.length === 0) {
            return interaction.reply({
                embeds: [{
                    color: 0x7289DA,
                    title: 'Server Blacklist',
                    description: 'The blacklist is currently empty.',
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        // Paginate: show up to 10 entries per embed to stay within Discord limits
        const PAGE_SIZE = 10;
        const page = list.slice(0, PAGE_SIZE);

        const fieldLines = page.map((entry, i) => {
            const added = new Date(entry.addedAt).toLocaleDateString();
            return `**${i + 1}.** ${entry.userTag} (\`${entry.userId}\`)\nReason: ${entry.reason} — Added by ${entry.moderatorTag} on ${added}`;
        });

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`Server Blacklist — ${interaction.guild.name}`)
            .setDescription(fieldLines.join('\n\n'))
            .setFooter({ text: `${list.length} total entr${list.length === 1 ? 'y' : 'ies'}${list.length > PAGE_SIZE ? ` (showing first ${PAGE_SIZE})` : ''}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error('[ERROR] Blacklist view error:', error);
        await replyError(interaction, error);
    }
}

/**
 * Sends a generic error reply
 */
async function replyError(interaction, error) {
    const errorEmbed = {
        color: 0xFF0000,
        title: '[ERROR] Command Failed',
        description: 'An error occurred while managing the blacklist.',
        fields: [{ name: 'Details', value: error.message, inline: true }],
        timestamp: new Date().toISOString()
    };
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
    } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}
