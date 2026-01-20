// Logging Configuration Command
// Allows admins to enable/disable specific logging events

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { setGuildData, getGuildData } from '../utils/dataStore.js';
import { config } from '../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Configure server event logging')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable logging for a specific event')
                .addStringOption(option =>
                    option
                        .setName('event')
                        .setDescription('The event to enable')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Message Delete', value: 'messageDelete' },
                            { name: 'Message Edit', value: 'messageEdit' },
                            { name: 'Member Join', value: 'memberJoin' },
                            { name: 'Member Leave', value: 'memberLeave' },
                            { name: 'Role Changes', value: 'roleChanges' },
                            { name: 'Voice Changes', value: 'voiceChanges' },
                            { name: 'All Events', value: 'all' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable logging for a specific event')
                .addStringOption(option =>
                    option
                        .setName('event')
                        .setDescription('The event to disable')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Message Delete', value: 'messageDelete' },
                            { name: 'Message Edit', value: 'messageEdit' },
                            { name: 'Member Join', value: 'memberJoin' },
                            { name: 'Member Leave', value: 'memberLeave' },
                            { name: 'Role Changes', value: 'roleChanges' },
                            { name: 'Voice Changes', value: 'voiceChanges' },
                            { name: 'All Events', value: 'all' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current logging configuration')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'admin',

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'enable' || subcommand === 'disable') {
            const event = interaction.options.getString('event');
            const enabled = subcommand === 'enable';

            // Get existing config
            const existingConfig = getGuildData('logging', guildId);
            const events = existingConfig.events || { ...config.logging.defaultEvents };

            if (event === 'all') {
                // Enable/disable all events
                for (const eventName of config.logging.availableEvents) {
                    events[eventName] = enabled;
                }
            } else {
                events[event] = enabled;
            }

            // Save updated config
            setGuildData('logging', guildId, {
                ...existingConfig,
                events
            });

            const eventDisplay = event === 'all' ? 'All events' : getEventDisplayName(event);
            return interaction.reply({
                content: `${eventDisplay} logging has been **${enabled ? 'enabled' : 'disabled'}**.`,
                ephemeral: true
            });

        } else if (subcommand === 'status') {
            const loggingConfig = getGuildData('logging', guildId);
            const events = loggingConfig.events || config.logging.defaultEvents;

            // Check if log channel is set
            let channelStatus = 'Not configured';
            if (loggingConfig.channelId) {
                try {
                    const channel = await interaction.guild.channels.fetch(loggingConfig.channelId);
                    if (channel) {
                        channelStatus = `<#${channel.id}>`;
                    } else {
                        channelStatus = 'Channel not found (needs reconfiguration)';
                    }
                } catch {
                    channelStatus = 'Channel not found (needs reconfiguration)';
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Logging Configuration')
                .setDescription('Current server event logging settings')
                .addFields(
                    { name: 'Log Channel', value: channelStatus, inline: false },
                    { name: '\u200B', value: '**Event Status**', inline: false },
                    { 
                        name: 'Message Delete', 
                        value: events.messageDelete ?? config.logging.defaultEvents.messageDelete ? '✅ Enabled' : '❌ Disabled', 
                        inline: true 
                    },
                    { 
                        name: 'Message Edit', 
                        value: events.messageEdit ?? config.logging.defaultEvents.messageEdit ? '✅ Enabled' : '❌ Disabled', 
                        inline: true 
                    },
                    { 
                        name: 'Member Join', 
                        value: events.memberJoin ?? config.logging.defaultEvents.memberJoin ? '✅ Enabled' : '❌ Disabled', 
                        inline: true 
                    },
                    { 
                        name: 'Member Leave', 
                        value: events.memberLeave ?? config.logging.defaultEvents.memberLeave ? '✅ Enabled' : '❌ Disabled', 
                        inline: true 
                    },
                    { 
                        name: 'Role Changes', 
                        value: events.roleChanges ?? config.logging.defaultEvents.roleChanges ? '✅ Enabled' : '❌ Disabled', 
                        inline: true 
                    },
                    { 
                        name: 'Voice Changes', 
                        value: events.voiceChanges ?? config.logging.defaultEvents.voiceChanges ? '✅ Enabled' : '❌ Disabled', 
                        inline: true 
                    }
                )
                .setFooter({ text: 'Use /logging enable or /logging disable to change settings' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};

/**
 * Gets the display name for an event
 * @param {string} event - The event key
 * @returns {string} The display name
 */
function getEventDisplayName(event) {
    const names = {
        messageDelete: 'Message Delete',
        messageEdit: 'Message Edit',
        memberJoin: 'Member Join',
        memberLeave: 'Member Leave',
        roleChanges: 'Role Changes',
        voiceChanges: 'Voice Changes'
    };
    return names[event] || event;
}
