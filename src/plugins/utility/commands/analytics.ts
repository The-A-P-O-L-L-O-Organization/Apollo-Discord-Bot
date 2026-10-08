import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { handleServerStats } from './analytics/serverStats.js';
import { handleCommandStats } from './analytics/commandStats.js';
import { handleActivityStats } from './analytics/activityStats.js';
import { handleModerationStats } from './analytics/moderationStats.js';
import { handleUserStats } from './analytics/userStats.js';
import { handleExport } from './analytics/exportStats.js';

export default {
    data: new SlashCommandBuilder()
        .setName('analytics')
        .setDescription('View server analytics and statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('View server-wide statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('commands')
                .setDescription('View command usage statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('activity')
                .setDescription('View message activity statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('moderation')
                .setDescription('View moderation team statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 30)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('View individual user statistics')
                .addUserOption(option =>
                    option
                        .setName('target')
                        .setDescription('User to analyze')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 30)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Export analytics data to a file')
                .addStringOption(option =>
                    option
                        .setName('format')
                        .setDescription('Export format')
                        .setRequired(true)
                        .addChoices(
                            { name: 'CSV', value: 'csv' },
                            { name: 'JSON', value: 'json' }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to export (default: 30)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        ),
    name: 'analytics',
    category: 'analytics',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
            case 'server':
                return handleServerStats(interaction);
            case 'commands':
                return handleCommandStats(interaction);
            case 'activity':
                return handleActivityStats(interaction);
            case 'moderation':
                return handleModerationStats(interaction);
            case 'user':
                return handleUserStats(interaction);
            case 'export':
                return handleExport(interaction);
            }

        } catch (error) {
            const errorMessage = await handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }

};
