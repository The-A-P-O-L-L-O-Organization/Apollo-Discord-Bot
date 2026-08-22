import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getGuildData, getData, updateGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { safeError } from '../../../utils/safeError.js';
import { isOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { logger } from './utils/logger.js';

export default {
import { logger } from '../../../utils/logger.js';
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
        },
        {
            name: 'global',
            description: 'Manage the global blacklist (applies to all servers)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'action',
                    description: 'Action to perform',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' },
                        { name: 'view', value: 'view' }
                    ]
                },
                {
                    name: 'user',
                    description: 'The user to blacklist globally (required for add/remove)',
                    type: 6, // USER
                    required: false
                },
                {
                    name: 'reason',
                    description: 'Reason for global blacklist (required for add)',
                    type: 3, // STRING
                    required: false
                }
            ]
        }
    ],

    async execute(interaction) {try {
try {

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            await handleAdd(interaction);
        } else if (subcommand === 'remove') {
            await handleRemove(interaction);
        } else if (subcommand === 'view') {
            await handleView(interaction);
        } else if (subcommand === 'global') {
            await handleGlobal(interaction);
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
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
                flags: 64
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
                flags: 64
            });
        }

        const guildData = await getGuildData('blacklist', interaction.guild.id);
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
                flags: 64
            });
        }

        // Add to blacklist
        await updateGuildData('blacklist', interaction.guild.id, (data) => {
            if (!data.entries) data.entries = {};
            data.entries[user.id] = {
                userId: user.id,
                userTag: user.tag,
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                addedAt: Date.now()
            };
            return data;
        });

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

        logger.info(`[MODERATION] User ${user.tag} blacklisted by ${interaction.user.tag}. Reason: ${reason}`);

    } catch (error) {
        logger.error('[ERROR] Blacklist add error:', error);
        await replyError(interaction, error);
    }
}

/**
 * Removes a user from the guild blacklist
 */
async function handleRemove(interaction) {
    try {
        const user = interaction.options.getUser('user');

        const guildData = await getGuildData('blacklist', interaction.guild.id);
        const entries = guildData.entries || {};

        if (!entries[user.id]) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Not Blacklisted',
                    description: `${user.tag} is not on the blacklist.`,
                    timestamp: new Date().toISOString()
                }],
                flags: 64
            });
        }

        const removedEntry = entries[user.id];
        await updateGuildData('blacklist', interaction.guild.id, (data) => {
            if (data.entries) {
                delete data.entries[user.id];
            }
            return data;
        });

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

        logger.info(`[MODERATION] User ${user.tag} removed from blacklist by ${interaction.user.tag}`);

    } catch (error) {
        logger.error('[ERROR] Blacklist remove error:', error);
        await replyError(interaction, error);
    }
}

/**
 * Shows all blacklisted users for the guild
 */
async function handleView(interaction) {
    try {
        const guildData = await getGuildData('blacklist', interaction.guild.id);
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
                flags: 64
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

        await interaction.reply({ embeds: [embed], flags: 64 });

    } catch (error) {
        logger.error('[ERROR] Blacklist view error:', error);
        await replyError(interaction, error);
    }
}

/**
 * Handles global blacklist operations (add/remove/view across all servers)
 * Restricted to bot owners defined in OWNER_IDS env var
 */
async function handleGlobal(interaction) {
    try {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Access Denied',
                    description: 'This command is restricted to the bot owner only.',
                    timestamp: new Date().toISOString()
                }],
                flags: 64
            });
        }

        const action = interaction.options.getString('action');
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        const globalData = await getData('global_blacklist') || { entries: {} };
        const entries = globalData.entries || {};

        if (action === 'add') {
            if (!user || !reason) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing Arguments',
                        description: 'Both user and reason are required to add to global blacklist.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }

            if (user.id === interaction.user.id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Self Action',
                        description: 'You cannot blacklist yourself globally.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }

            if (entries[user.id]) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: '[WARNING] Already Blacklisted',
                        description: `${user.tag} is already on the global blacklist.\nReason: ${entries[user.id].reason}`,
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }

            await updateGuildData('global_blacklist', '__global__', (data) => {
                if (!data.entries) data.entries = {};
                data.entries[user.id] = {
                    userId: user.id,
                    userTag: user.tag,
                    reason: reason,
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    addedAt: Date.now()
                };
                return data;
            });

            const successEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('[SUCCESS] User Globally Blacklisted')
                .setDescription(`${user.tag} has been added to the global blacklist. They will be banned from all servers the bot is in.`)
                .addFields(
                    { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed] });
            logger.info(`[MODERATION] User ${user.tag} globally blacklisted by ${interaction.user.tag}. Reason: ${reason}`);

        } else if (action === 'remove') {
            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing Arguments',
                        description: 'User is required to remove from global blacklist.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }

            if (!entries[user.id]) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Not Blacklisted',
                        description: `${user.tag} is not on the global blacklist.`,
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }

            const removedEntry = entries[user.id];
            await updateGuildData('global_blacklist', '__global__', (data) => {
                if (data.entries) {
                    delete data.entries[user.id];
                }
                return data;
            });

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('[SUCCESS] User Removed from Global Blacklist')
                .setDescription(`${user.tag} has been removed from the global blacklist.`)
                .addFields(
                    { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                    { name: 'Removed By', value: interaction.user.tag, inline: true },
                    { name: 'Original Reason', value: removedEntry.reason, inline: false }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed] });
            logger.info(`[MODERATION] User ${user.tag} removed from global blacklist by ${interaction.user.tag}`);

        } else if (action === 'view') {
            const list = Object.values(entries);

            if (list.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0x7289DA,
                        title: 'Global Blacklist',
                        description: 'The global blacklist is currently empty.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }

            const PAGE_SIZE = 10;
            const page = list.slice(0, PAGE_SIZE);

            const fieldLines = page.map((entry, i) => {
                const added = new Date(entry.addedAt).toLocaleDateString();
                return `**${i + 1}.** ${entry.userTag} (\`${entry.userId}\`)\nReason: ${entry.reason} — Added by ${entry.moderatorTag} on ${added}`;
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Global Blacklist — All Servers')
                .setDescription(fieldLines.join('\n\n'))
                .setFooter({ text: `${list.length} total entr${list.length === 1 ? 'y' : 'ies'}${list.length > PAGE_SIZE ? ` (showing first ${PAGE_SIZE})` : ''}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: 64 });
        }

    } catch (error) {
        logger.error('[ERROR] Global blacklist error:', error);
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
        fields: [{ name: 'Details', value: safeError(error), inline: true }],
        timestamp: new Date().toISOString()
    };
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
    } else {
        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}
