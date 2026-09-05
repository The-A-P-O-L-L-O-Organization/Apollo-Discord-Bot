import { ChatInputCommandInteraction, MessageFlags, PermissionsBitField, GuildChannel, TextChannel } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface AnnouncementData {
    id: string;
    channelId: string;
    channelName: string;
    message: string;
    scheduledBy: string;
    scheduledByTag: string;
    scheduledAt: number;
    sendAt: number;
}

export default {
    // Announcement Command
    // Schedule announcements to be sent later
    name: 'announcement',
    description: 'Schedule an announcement to be sent',
    category: 'utility',

    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'schedule',
            description: 'Schedule an announcement',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'channel',
                    description: 'Channel to send announcement',
                    type: 7, // CHANNEL
                    required: true
                },
                {
                    name: 'message',
                    description: 'The announcement message',
                    type: 3, // STRING
                    required: true
                },
                {
                    name: 'delay',
                    description: 'Delay before sending (e.g., 1h, 30m)',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'view',
            description: 'View scheduled announcements',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'cancel',
            description: 'Cancel a scheduled announcement',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'id',
                    description: 'Announcement ID',
                    type: 3, // STRING
                    required: true
                }
            ]
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'schedule') {
                await handleSchedule(interaction);
            } else if (subcommand === 'view') {
                await handleView(interaction);
            } else if (subcommand === 'cancel') {
                await handleCancel(interaction);
            }

        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] Announcement command error' });

            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error instanceof Error ? error.message : 'Unknown error',
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

async function handleSchedule(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message') ?? '';
    const delayStr = interaction.options.getString('delay') ?? '';

    if (!channel || !message || !delayStr) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Missing Parameters',
                description: 'Channel, message, and delay are required.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Parse delay
    const delayMs = parseDelay(delayStr);
    if (!delayMs) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Delay',
                description: 'Use format like 1h, 30m, 1d',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const scheduledTime = Date.now() + delayMs;
    const announcementId = generateId();

    // Store announcement
    const announcement: AnnouncementData = {
        id: announcementId,
        channelId: channel.id,
        channelName: channel.name ?? 'unknown',
        message: message,
        scheduledBy: interaction.user.id,
        scheduledByTag: interaction.user.tag,
        scheduledAt: Date.now(),
        sendAt: scheduledTime
    };

    await setGuildData('announcements', interaction.guild!.id, {
        [announcementId]: announcement
    });

    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Announcement Scheduled',
        description: `Announcement will be sent in #${channel.name}`,
        fields: [
            {
                name: '[INFO] Announcement ID',
                value: announcementId,
                inline: true
            },
            {
                name: '[INFO] Message',
                value: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
                inline: false
            },
            {
                name: '[INFO] Scheduled For',
                value: `<t:${Math.floor(scheduledTime / 1000)}:R>`,
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

    logger.info(`[ANNOUNCEMENT] Scheduled by ${interaction.user.tag} for ${channel.name}`);
}

async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
    const announcements = await getGuildData('announcements', interaction.guild!.id) as Record<string, AnnouncementData> | null;

    if (!announcements || Object.keys(announcements).length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Scheduled Announcements',
                description: 'There are no scheduled announcements.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const now = Date.now();
    const scheduled = Object.values(announcements).filter(a => a.sendAt > now);

    if (scheduled.length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Active Announcements',
                description: 'All announcements have been sent.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const viewEmbed = {
        color: 0x3498DB,
        title: '[ANNOUNCEMENTS] Scheduled',
        description: `Total: ${scheduled.length}`,
        fields: scheduled.slice(0, 5).map(a => ({
            name: `#${a.id}`,
            value: `Channel: <#${a.channelId}>\nScheduled: <t:${Math.floor(a.sendAt / 1000)}:R>\nBy: ${a.scheduledByTag}`,
            inline: false
        })),
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [viewEmbed], flags: MessageFlags.Ephemeral });
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
    const id = interaction.options.getString('id') ?? '';

    const announcements = await getGuildData('announcements', interaction.guild!.id) as Record<string, AnnouncementData> | null;

    if (!announcements || !announcements[id]) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Not Found',
                description: 'No announcement found with that ID.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    delete announcements[id];
    await setGuildData('announcements', interaction.guild!.id, announcements);

    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Announcement Cancelled',
        description: `Announcement #${id} has been cancelled.`,
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

function parseDelay(str: string): number | null {
    const match = str.match(/^(\d+)([mhd])$/i);
    if (!match) { return null; }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!.toLowerCase();

    const multipliers: Record<string, number> = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return value * (multipliers[unit] ?? 0);
}

function generateId(): string {
    return `ANN-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}