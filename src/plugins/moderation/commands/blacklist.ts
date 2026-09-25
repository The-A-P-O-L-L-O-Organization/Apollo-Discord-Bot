// Blacklist Command - Manage server join blacklist
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, getData, updateGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { safeError } from '../../../utils/safeError.js';
import { isOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface BlacklistEntry {
    userId: string;
    userTag: string;
    reason: string;
    moderatorId: string;
    moderatorTag: string;
    addedAt: number;
}

interface BlacklistData {
    entries?: Record<string, BlacklistEntry>;
    [key: string]: unknown;
}

export default {
    name: 'blacklist',
    description: 'Manage the server join blacklist',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.BanMembers,
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

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
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
            const errorMessage = handleDiscordError(error) ?? t('blacklist.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

/**
 * Adds a user to the guild blacklist
 */
async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    try {
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);

        // Prevent blacklisting yourself
        if (user.id === interaction.user.id) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('blacklist.selfActionTitle'),
                    description: t('blacklist.selfActionDescription'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Prevent blacklisting the bot
        if (user.id === interaction.client.user.id) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('blacklist.botProtectionTitle'),
                    description: t('blacklist.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const guildData = (await getGuildData('blacklist', interaction.guild!.id)) as BlacklistData;
        const entries = guildData.entries ?? {};

        // Check if already blacklisted
        const existingEntry = entries[user.id];
        if (existingEntry) {
            await interaction.reply({
                embeds: [{
                    color: 0xFFA500,
                    title: t('blacklist.warningAlreadyBlacklisted'),
                    description: t('blacklist.userIsAlreadyOnThe', { user: user.tag, reason: existingEntry.reason }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Add to blacklist
        await updateGuildData('blacklist', interaction.guild!.id, (data: BlacklistData) => {
            data.entries ??= {};
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
            .setTitle(t('blacklist.successUserBlacklisted'))
            .setDescription(t('blacklist.userHasBeenAddedTo', { user: user.tag }))
            .addFields(
                { name: t('blacklist.user'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
                { name: t('blacklist.moderator'), value: interaction.user.tag, inline: true },
                { name: t('blacklist.reason'), value: reason, inline: false }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

        // Send mod log
        await sendModLog(interaction.guild!, {
            action: 'blacklist',
            target: user,
            moderator: interaction.user,
            reason: reason
        });

        logger.info({ msg: `[MODERATION] User ${user.tag} blacklisted by ${interaction.user.tag}. Reason: ${reason}` });

    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Blacklist add error' });
        await replyError(interaction, error);
    }
}

/**
 * Removes a user from the guild blacklist
 */
async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    try {
        const user = interaction.options.getUser('user', true);

        const guildData = (await getGuildData('blacklist', interaction.guild!.id)) as BlacklistData;
        const entries = guildData.entries ?? {};

        if (!entries[user.id]) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('blacklist.errorNotBlacklisted'),
                    description: t('blacklist.userIsNotOnThe', { user: user.tag }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const removedEntry = entries[user.id]!;
        await updateGuildData('blacklist', interaction.guild!.id, (data: BlacklistData) => {
            if (data.entries) {
                delete data.entries[user.id];
            }
            return data;
        });

        const successEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(t('blacklist.successUserRemovedFromBlacklist'))
            .setDescription(t('blacklist.userHasBeenRemovedFrom', { user: user.tag }))
            .addFields(
                { name: t('blacklist.user2'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
                { name: t('blacklist.removedBy'), value: interaction.user.tag, inline: true },
                { name: t('blacklist.originalReason'), value: removedEntry.reason, inline: false }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

        logger.info({ msg: `[MODERATION] User ${user.tag} removed from blacklist by ${interaction.user.tag}` });

    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Blacklist remove error' });
        await replyError(interaction, error);
    }
}

/**
 * Shows all blacklisted users for the guild
 */
async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    try {
        const guildData = (await getGuildData('blacklist', interaction.guild!.id)) as BlacklistData;
        const entries = guildData.entries ?? {};
        const list = Object.values(entries);

        if (list.length === 0) {
            await interaction.reply({
                embeds: [{
                    color: 0x7289DA,
                    title: t('blacklist.serverBlacklist'),
                    description: t('blacklist.theBlacklistIsCurrentlyEmpty'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
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
            .setTitle(t('blacklist.serverBlacklistServer', { server: interaction.guild!.name }))
            .setDescription(fieldLines.join('\n\n'))
            .setFooter({ text: `${list.length} total entr${list.length === 1 ? 'y' : 'ies'}${list.length > PAGE_SIZE ? ` (showing first ${PAGE_SIZE})` : ''}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Blacklist view error' });
        await replyError(interaction, error);
    }
}

/**
 * Handles global blacklist operations (add/remove/view across all servers)
 * Restricted to bot owners defined in OWNER_IDS env var
 */
async function handleGlobal(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    try {
        if (!isOwner(interaction.user.id)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('blacklist.errorAccessDenied'),
                    description: t('blacklist.thisCommandIsRestrictedTo'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const action = interaction.options.getString('action', true);
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        const globalData = (await getData('global_blacklist')) as BlacklistData | undefined ?? { entries: {} };
        const entries = globalData.entries ?? {};

        if (action === 'add') {
            if (!user || !reason) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('blacklist.errorMissingArguments'),
                        description: t('blacklist.bothUserAndReasonAre'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (user.id === interaction.user.id) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('blacklist.selfActionTitle2'),
                        description: t('blacklist.selfActionDescription2'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const existingGlobalEntry = entries[user.id];
            if (existingGlobalEntry) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: t('blacklist.warningAlreadyBlacklisted2'),
                        description: t('blacklist.userIsAlreadyOnThe2', { user: user.tag, reason: existingGlobalEntry.reason }),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await updateGuildData('global_blacklist', '__global__', (data: BlacklistData) => {
                data.entries ??= {};
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
                .setTitle(t('blacklist.successUserGloballyBlacklisted'))
                .setDescription(t('blacklist.userHasBeenAddedTo2', { user: user.tag }))
                .addFields(
                    { name: t('blacklist.user3'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
                    { name: t('blacklist.moderator2'), value: interaction.user.tag, inline: true },
                    { name: t('blacklist.reason2'), value: reason, inline: false }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed] });
            logger.info({ msg: `[MODERATION] User ${user.tag} globally blacklisted by ${interaction.user.tag}. Reason: ${reason}` });

        } else if (action === 'remove') {
            if (!user) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('blacklist.errorMissingArguments2'),
                        description: t('blacklist.userIsRequiredToRemove'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (!entries[user.id]) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('blacklist.errorNotBlacklisted2'),
                        description: t('blacklist.userIsNotOnThe2', { user: user.tag }),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const removedEntry = entries[user.id]!;
            await updateGuildData('global_blacklist', '__global__', (data: BlacklistData) => {
                if (data.entries) {
                    delete data.entries[user.id];
                }
                return data;
            });

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(t('blacklist.successUserRemovedFromGlobal'))
                .setDescription(t('blacklist.userHasBeenRemovedFrom2', { user: user.tag }))
                .addFields(
                    { name: t('blacklist.user4'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
                    { name: t('blacklist.removedBy2'), value: interaction.user.tag, inline: true },
                    { name: t('blacklist.originalReason2'), value: removedEntry.reason, inline: false }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed] });
            logger.info({ msg: `[MODERATION] User ${user.tag} removed from global blacklist by ${interaction.user.tag}` });

        } else if (action === 'view') {
            const list = Object.values(entries);

            if (list.length === 0) {
                await interaction.reply({
                    embeds: [{
                        color: 0x7289DA,
                        title: t('blacklist.globalBlacklist'),
                        description: t('blacklist.theGlobalBlacklistIsCurrently'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const PAGE_SIZE = 10;
            const page = list.slice(0, PAGE_SIZE);

            const fieldLines = page.map((entry, i) => {
                const added = new Date(entry.addedAt).toLocaleDateString();
                return `**${i + 1}.** ${entry.userTag} (\`${entry.userId}\`)\nReason: ${entry.reason} — Added by ${entry.moderatorTag} on ${added}`;
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(t('blacklist.globalBlacklistAllServers'))
                .setDescription(fieldLines.join('\n\n'))
                .setFooter({ text: `${list.length} total entr${list.length === 1 ? 'y' : 'ies'}${list.length > PAGE_SIZE ? ` (showing first ${PAGE_SIZE})` : ''}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Global blacklist error' });
        await replyError(interaction, error);
    }
}

/**
 * Sends a generic error reply
 */
async function replyError(interaction: ChatInputCommandInteraction, error: unknown): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const errorEmbed = {
        color: 0xFF0000,
        title: t('blacklist.commandFailedTitle'),
        description: t('blacklist.anErrorOccurredWhileManaging'),
        fields: [{ name: t('blacklist.details'), value: safeError(error), inline: true }],
        timestamp: new Date().toISOString()
    };
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
    } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}