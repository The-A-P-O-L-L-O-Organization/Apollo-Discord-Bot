// Set Log Channel Command
// Allows admins to configure the server's logging channel

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { setGuildData, getGuildData } from '../utils/dataStore.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setlogchannel')
        .setDescription('Set the channel for server event logs')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the logging channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to send logs to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove the logging channel (disables logging)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current logging channel')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'admin',

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');

            // Verify bot can send messages to the channel
            const botMember = interaction.guild.members.me;
            const permissions = channel.permissionsFor(botMember);

            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                return interaction.reply({
                    content: `I don't have permission to send messages or embeds in ${channel}. Please grant me the required permissions.`,
                    ephemeral: true
                });
            }

            // Get existing logging config or create new one
            const existingConfig = getGuildData('logging', guildId);
            const newConfig = {
                ...existingConfig,
                channelId: channel.id
            };

            setGuildData('logging', guildId, newConfig);

            return interaction.reply({
                content: `Logging channel has been set to ${channel}.\n\nUse \`/logging\` to configure which events are logged.`,
                ephemeral: true
            });

        } else if (subcommand === 'remove') {
            const existingConfig = getGuildData('logging', guildId);
            
            if (!existingConfig.channelId) {
                return interaction.reply({
                    content: 'No logging channel is currently set.',
                    ephemeral: true
                });
            }

            const newConfig = {
                ...existingConfig,
                channelId: null
            };

            setGuildData('logging', guildId, newConfig);

            return interaction.reply({
                content: 'Logging channel has been removed. Server event logging is now disabled.',
                ephemeral: true
            });

        } else if (subcommand === 'view') {
            const config = getGuildData('logging', guildId);

            if (!config.channelId) {
                return interaction.reply({
                    content: 'No logging channel is currently set.\n\nUse `/setlogchannel set` to configure one.',
                    ephemeral: true
                });
            }

            // Try to fetch the channel to verify it still exists
            try {
                const channel = await interaction.guild.channels.fetch(config.channelId);
                if (channel) {
                    return interaction.reply({
                        content: `Current logging channel: ${channel}\n\nUse \`/logging status\` to see which events are being logged.`,
                        ephemeral: true
                    });
                }
            } catch (error) {
                // Channel no longer exists
            }

            return interaction.reply({
                content: 'The configured logging channel no longer exists. Please set a new one with `/setlogchannel set`.',
                ephemeral: true
            });
        }
    }
};
