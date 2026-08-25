import { logger } from '../../../utils/logger.js';
import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getUserData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'warnings',
    description: 'View warnings for a user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to check warnings for',
            type: 6,
            required: true
        },
        {
            name: 'show-inactive',
            description: 'Include cleared/inactive warnings',
            type: 5,
            required: false
        }
    ],

    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const showInactive = interaction.options.getBoolean('show-inactive') || false;

            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing User',
                        description: 'Please specify a valid user.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            const allWarnings = await getUserData('warnings', interaction.guild.id, user.id) || [];

            const warnings = showInactive
                ? allWarnings
                : allWarnings.filter(w => w.active !== false);

            if (warnings.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: 'No Warnings Found',
                        description: showInactive
                            ? `${user.tag} has no warnings on record.`
                            : `${user.tag} has no active warnings.\n\nUse \`/warnings user:${user.tag} show-inactive:true\` to see cleared warnings.`,
                        thumbnail: { url: user.displayAvatarURL() },
                        timestamp: new Date().toISOString()
                    }]
                });
            }

            const activeCount = allWarnings.filter(w => w.active !== false).length;
            const inactiveCount = allWarnings.length - activeCount;

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`Warnings for ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `**User ID:** ${user.id}\n` +
                `**Active Warnings:** ${activeCount}\n` +
                `**Total on Record:** ${allWarnings.length}`
                )
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            const displayWarnings = warnings.slice(-10).reverse();

            for (let i = 0; i < displayWarnings.length; i++) {
                const warning = displayWarnings[i];
                const date = new Date(warning.timestamp);
                const status = warning.active === false ? '~~' : '';
                const statusLabel = warning.active === false ? ' [CLEARED]' : '';

                embed.addFields({
                    name: `${status}Warning #${warnings.length - i}${statusLabel}${status}`,
                    value: [
                        `**ID:** \`${warning.id}\``,
                        `**Reason:** ${warning.reason}`,
                        `**Moderator:** ${warning.moderatorTag || 'Unknown'}`,
                        `**Date:** <t:${Math.floor(warning.timestamp / 1000)}:F>`
                    ].join('\n'),
                    inline: false
                });
            }

            if (warnings.length > 10) {
                embed.addFields({
                    name: 'Note',
                    value: `Showing ${displayWarnings.length} of ${warnings.length} warnings (most recent first).`,
                    inline: false
                });
            }

            if (!showInactive && inactiveCount > 0) {
                embed.addFields({
                    name: 'Hidden Warnings',
                    value: `${inactiveCount} cleared warning(s) not shown. Use \`show-inactive:true\` to view.`,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed] });

            logger.info(`[INFO] Warnings viewed for ${user.tag} by ${interaction.user.tag}`);

        } catch (error) {
            logger.error('[ERROR] Warnings command error:', error);

            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: 'An error occurred while fetching warnings.',
                    fields: [{ name: 'Error', value: error.message, inline: true }],
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};