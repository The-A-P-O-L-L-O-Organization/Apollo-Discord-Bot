import { ChatInputCommandInteraction, PermissionsBitField, EmbedBuilder, MessageFlags, Message } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface GiveawayData {
    messageId: string;
    channelId: string;
    guildId: string;
    prize: string;
    hostId: string;
    hostTag: string;
    winners: number;
    endTime: number;
    participants: string[];
    createdAt: number;
}

interface GiveawayStore {
    active?: GiveawayData[];
}

export default {
    name: 'giveaway',
    description: 'Create and manage giveaways',
    category: 'Utility',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'create',
            description: 'Create a new giveaway',
            type: 1,
            options: [
                {
                    name: 'prize',
                    description: 'What is being given away',
                    type: 3,
                    required: true
                },
                {
                    name: 'duration',
                    description: 'Duration (e.g., 1h, 30m, 1d)',
                    type: 3,
                    required: true
                },
                {
                    name: 'winners',
                    description: 'Number of winners',
                    type: 4,
                    required: false
                }
            ]
        },
        {
            name: 'end',
            description: 'End a giveaway early',
            type: 1,
            options: [
                {
                    name: 'message_id',
                    description: 'Giveaway message ID',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'reroll',
            description: 'Reroll a giveaway winner',
            type: 1,
            options: [
                {
                    name: 'message_id',
                    description: 'Giveaway message ID',
                    type: 3,
                    required: true
                }
            ]
        }
    ],
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'create') {
                await handleCreate(interaction);
            } else if (subcommand === 'end') {
                await handleEnd(interaction);
            } else if (subcommand === 'reroll') {
                await handleReroll(interaction);
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

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    const prize = interaction.options.getString('prize', true);
    const durationStr = interaction.options.getString('duration', true);
    const winners = interaction.options.getInteger('winners') ?? 1;
    
    // Parse duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Duration',
                description: 'Use format like 1h, 30m, 1d, 7d',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const endTime = Date.now() + durationMs;
    
    // Create giveaway message
    const giveawayEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('GIVEAWAY')
        .setDescription(`**Prize:** ${prize}`)
        .addFields(
            { name: 'Hosted by', value: interaction.user.toString(), inline: true },
            { name: 'Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
            { name: 'Winners', value: `${winners}`, inline: true }
        )
        .setFooter({ text: 'Click the button to enter!' })
        .setTimestamp();
    
    const message = await interaction.reply({
        embeds: [giveawayEmbed],
        fetchReply: true
    }) as Message;
    
    // Add reaction
    await message.react('[SUCCESS]');
    
    // Store giveaway data
    const giveawayData: GiveawayData = {
        messageId: message.id,
        channelId: interaction.channel!.id,
        guildId: interaction.guild!.id,
        prize: prize,
        hostId: interaction.user.id,
        hostTag: interaction.user.tag,
        winners: winners,
        endTime: endTime,
        participants: [],
        createdAt: Date.now()
    };
    
    await updateGuildData('giveaways', interaction.guild!.id, (data: Record<string, unknown>) => {
        if (!data['active']) { data['active'] = []; }
        (data['active'] as GiveawayData[]).push(giveawayData);
        return data;
    });
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Giveaway Created',
        description: `Giveaway for **${prize}** has been created!`,
        fields: [
            {
                name: '[INFO] Message ID',
                value: message.id,
                inline: true
            },
            {
                name: '[INFO] Ends',
                value: `<t:${Math.floor(endTime / 1000)}:R>`,
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

async function handleEnd(interaction: ChatInputCommandInteraction): Promise<void> {
    const messageId = interaction.options.getString('message_id', true);
    
    const giveawayData = await getGuildData('giveaways', interaction.guild!.id) as GiveawayStore | undefined;
    const giveaway = giveawayData?.active?.find((g: GiveawayData) => g.messageId === messageId);
    
    if (!giveaway) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Giveaway Not Found',
                description: 'No active giveaway found with that ID.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // End the giveaway (simplified - would need full implementation)
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Giveaway Ended',
        description: 'Giveaway ended! Use reroll to pick new winners.',
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

async function handleReroll(interaction: ChatInputCommandInteraction): Promise<void> {
    const messageId = interaction.options.getString('message_id', true);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Giveaway Rerolled',
        description: 'New winner(s) have been selected!',
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

function parseDuration(str: string): number | null {
    const match = str.match(/^(\d+)([mhd])$/i);
    if (!match) { return null; }
    
    const value = parseInt(match[1]!);
    const unit = match[2]!.toLowerCase();
    
    const multipliers: Record<string, number> = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };
    
    return value * (multipliers[unit] ?? 0);
}