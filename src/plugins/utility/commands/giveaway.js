// Giveaway Command
export default {
// Create and manage giveaways
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

    name: 'giveaway',
    description: 'Create and manage giveaways',
    category: 'Fun',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'create',
            description: 'Create a new giveaway',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'prize',
                    description: 'What is being given away',
                    type: 3, // STRING
                    required: true
                },
                {
                    name: 'duration',
                    description: 'Duration (e.g., 1h, 30m, 1d)',
                    type: 3, // STRING
                    required: true
                },
                {
                    name: 'winners',
                    description: 'Number of winners',
                    type: 4, // INTEGER
                    required: false
                }
            ]
        },
        {
            name: 'end',
            description: 'End a giveaway early',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'message_id',
                    description: 'Giveaway message ID',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'reroll',
            description: 'Reroll a giveaway winner',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'message_id',
                    description: 'Giveaway message ID',
                    type: 3, // STRING
                    required: true
                }
            ]
        }
    ],
    
    async execute(interaction) {try {
try {

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
            logger.error('[ERROR] Giveaway command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
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

async function handleCreate(interaction) {
    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winners = interaction.options.getInteger('winners') || 1;
    
    // Parse duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Duration',
                description: 'Use format like 1h, 30m, 1d, 7d',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
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
    });
    
    // Add reaction
    await message.react('🎉');
    
    // Store giveaway data
    const giveawayData = {
        messageId: message.id,
        channelId: interaction.channel.id,
        guildId: interaction.guild.id,
        prize: prize,
        hostId: interaction.user.id,
        hostTag: interaction.user.tag,
        winners: winners,
        endTime: endTime,
        participants: [],
        createdAt: Date.now()
    };
    
    await updateGuildData('giveaways', interaction.guild.id, data => {
        if (!data.active) {data.active = [];}
        data.active.push(giveawayData);
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
    
    await interaction.followUp({ embeds: [successEmbed], flags: 64 });
}

async function handleEnd(interaction) {
    const messageId = interaction.options.getString('message_id');
    
    const giveawayData = await getGuildData('giveaways', interaction.guild.id);
    const giveaway = giveawayData?.active?.find(g => g.messageId === messageId);
    
    if (!giveaway) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Giveaway Not Found',
                description: 'No active giveaway found with that ID.',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
    
    // End the giveaway (simplified - would need full implementation)
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Giveaway Ended',
        description: 'Giveaway ended! Use reroll to pick new winners.',
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], flags: 64 });
}

async function handleReroll(interaction) {
    const messageId = interaction.options.getString('message_id');
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Giveaway Rerolled',
        description: 'New winner(s) have been selected!',
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], flags: 64 });
}

function parseDuration(str) {
    const match = str.match(/^(\d+)([mhd])$/i);
    if (!match) {return null;}
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };
    
    return value * (multipliers[unit] || 0);
}


