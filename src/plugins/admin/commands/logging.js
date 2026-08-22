import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    name: 'logging',
    canQueue: false,
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
        try {
            try {
                const subcommand = interaction.options.getSubcommand();
                const guildId = interaction.guild.id;

                if (subcommand === 'enable' || subcommand === 'disable') {
                    const event = interaction.options.getString('event');
                    const enabled = subcommand === 'enable';

                    const existingConfig = await getGuildData('logging', guildId);
                    const events = existingConfig.events || { ...config.logging.defaultEvents };

                    if (event === 'all') {
                        for (const eventName of config.logging.availableEvents) {
                            events[eventName] = enabled;
                        }
                    } else {
                        events[event] = enabled;
                    }

                    await setGuildData('logging', guildId, {
                        ...existingConfig,
                        events
                    });

const eventDisplay = event === 'all' ? 'All events' : getEventDisplayName(event);
                 return interaction.reply({
                     content: `${eventDisplay} logging has been **${enabled ? 'enabled' : 'disabled'}**.`,
                     flags: 64
                 });
            } else if (subcommand === 'status') {
                const loggingConfig = await getGuildData('logging', guildId);
                const events = loggingConfig.events || config.logging.defaultEvents;

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
                             value: events.messageDelete ?? config.logging.defaultEvents.messageDelete ? '[ON] Enabled' : '[OFF] Disabled', 
                             inline: true 
                         },
                         { 
                             name: 'Message Edit', 
                             value: events.messageEdit ?? config.logging.defaultEvents.messageEdit ? '[ON] Enabled' : '[OFF] Disabled', 
                             inline: true 
                         },
                         { 
                             name: 'Member Join', 
                             value: events.memberJoin ?? config.logging.defaultEvents.memberJoin ? '[ON] Enabled' : '[OFF] Disabled', 
                             inline: true 
                         },
                         { 
                             name: 'Member Leave', 
                             value: events.memberLeave ?? config.logging.defaultEvents.memberLeave ? '[ON] Enabled' : '[OFF] Disabled', 
                             inline: true 
                         },
                         { 
                             name: 'Role Changes', 
                             value: events.roleChanges ?? config.logging.defaultEvents.roleChanges ? '[ON] Enabled' : '[OFF] Disabled', 
                             inline: true 
                         },
                         { 
                             name: 'Voice Changes', 
                             value: events.voiceChanges ?? config.logging.defaultEvents.voiceChanges ? '[ON] Enabled' : '[OFF] Disabled', 
                             inline: true 
                         }
                     )
                     .setFooter({ text: 'Use /logging enable or /logging disable to change settings' })
                     .setTimestamp();

                 return interaction.reply({ embeds: [embed], flags: 64 });
            }
        } catch (error) {
            const userMessage = handleDiscordError(error);
            if (userMessage) {
                await safeReply(interaction, userMessage);
            }
        }
    
} catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

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
