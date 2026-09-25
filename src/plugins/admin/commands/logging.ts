import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            try {
                const subcommand = interaction.options.getSubcommand();
                const guildId = interaction.guild!.id;
                const resolvedLocale = await i18n.resolveLocale({
                    locale: interaction.locale ?? null,
                    guildLocale: interaction.guildLocale ?? null,
                    guildId: interaction.guildId ?? null
                });
                const t = i18n.getFixedT(resolvedLocale, 'admin');

                if (subcommand === 'enable' || subcommand === 'disable') {
                    const event = interaction.options.getString('event');
                    const enabled = subcommand === 'enable';

                    const existingConfig = await getGuildData('logging', guildId);
                    const events = (existingConfig['events'] as Record<string, boolean>) || { ...config.logging.defaultEvents };

                    if (event === 'all') {
                        for (const eventName of config.logging.availableEvents) {
                            events[eventName] = enabled;
                        }
                    } else {
                        events[event!] = enabled;
                    }

                    await setGuildData('logging', guildId, {
                        ...existingConfig,
                        events
                    });

                    const eventDisplay = event === 'all' ? t('logging.allEvents') : getEventDisplayName(event ?? '', t);
                    return interaction.reply({
                        content: t('logging.toggle', { event: eventDisplay, state: enabled ? t('logging.stateEnabled') : t('logging.stateDisabled') }),
                        flags: MessageFlags.Ephemeral
                    });
                } else if (subcommand === 'status') {
                    const loggingConfig = await getGuildData('logging', guildId);
                    const events = (loggingConfig['events'] as Record<string, boolean>) || config.logging.defaultEvents;

                    let channelStatus = t('logging.notConfigured');
                    const channelId = loggingConfig['channelId'] as string | undefined;
                    if (channelId) {
                        try {
                            const channel = await interaction.guild!.channels.fetch(channelId);
                            if (channel) {
                                channelStatus = `<#${channel.id}>`;
                            } else {
                                channelStatus = t('logging.channelMissing');
                            }
                        } catch {
                            channelStatus = t('logging.channelMissing');
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#3498DB')
                        .setTitle(t('logging.statusTitle'))
                        .setDescription(t('logging.statusDescription'))
                        .addFields(
                            { name: t('logging.logChannel'), value: channelStatus, inline: false },
                            { name: '​', value: t('logging.eventStatus'), inline: false },
                            {
                                name: t('logging.field.messageDelete'),
                                value: events['messageDelete'] ?? config.logging.defaultEvents.messageDelete ? t('logging.onLabel') : t('logging.offLabel'),
                                inline: true
                            },
                            {
                                name: t('logging.field.messageEdit'),
                                value: events['messageEdit'] ?? config.logging.defaultEvents.messageEdit ? t('logging.onLabel') : t('logging.offLabel'),
                                inline: true
                            },
                            {
                                name: t('logging.field.memberJoin'),
                                value: events['memberJoin'] ?? config.logging.defaultEvents.memberJoin ? t('logging.onLabel') : t('logging.offLabel'),
                                inline: true
                            },
                            {
                                name: t('logging.field.memberLeave'),
                                value: events['memberLeave'] ?? config.logging.defaultEvents.memberLeave ? t('logging.onLabel') : t('logging.offLabel'),
                                inline: true
                            },
                            {
                                name: t('logging.field.roleChanges'),
                                value: events['roleChanges'] ?? config.logging.defaultEvents.roleChanges ? t('logging.onLabel') : t('logging.offLabel'),
                                inline: true
                            },
                            {
                                name: t('logging.field.voiceChanges'),
                                value: events['voiceChanges'] ?? config.logging.defaultEvents.voiceChanges ? t('logging.onLabel') : t('logging.offLabel'),
                                inline: true
                            }
                        )
                        .setFooter({ text: t('logging.footer') })
                        .setTimestamp();

                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (error) {
                const userMessage = handleDiscordError(error);
                if (userMessage) {
                    await safeReply(interaction, userMessage);
                }
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

function getEventDisplayName(event: string, t: (key: string) => string) {
    const names: Record<string, string> = {
        messageDelete: t('logging.field.messageDelete'),
        messageEdit: t('logging.field.messageEdit'),
        memberJoin: t('logging.field.memberJoin'),
        memberLeave: t('logging.field.memberLeave'),
        roleChanges: t('logging.field.roleChanges'),
        voiceChanges: t('logging.field.voiceChanges')
    };
    return names[event] ?? event;
}