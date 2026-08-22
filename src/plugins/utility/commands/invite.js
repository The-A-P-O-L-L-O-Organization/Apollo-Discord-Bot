// Invite Command
// Generate an invite link for the bot or create a server invite
import { logger } from './utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
import { logger } from '../../../utils/logger.js';
    name: 'invite',
    description: 'Generate an invite link or create a server invite',
    category: 'Utility',
    
    dmPermission: true,
    options: [
        {
            name: 'type',
            description: 'Type of invite to create',
            type: 3, // STRING
            required: false,
            choices: [
                { name: 'Bot Invite', value: 'bot' },
                { name: 'Server Invite', value: 'server' }
            ]
        },
        {
            name: 'max_age',
            description: 'Invite expiration time (0 = never)',
            type: 4, // INTEGER
            required: false
        },
        {
            name: 'max_uses',
            description: 'Maximum number of uses (0 = unlimited)',
            type: 4, // INTEGER
            required: false
        },
        {
            name: 'temporary',
            description: 'Kick members after they close the app',
            type: 5, // BOOLEAN
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const type = interaction.options.getString('type') || 'bot';
            
            if (type === 'bot') {
                // Generate bot invite
                const inviteLink = `https://discord.com/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands`;
                
                const inviteEmbed = {
                    color: 0x3498DB,
                    title: '[INVITE] Bot Invite Link',
                    description: 'Use this link to add the bot to your server.',
                    fields: [
                        {
                            name: '[LINK] Add Bot',
                            value: `[Click here to invite](${inviteLink})`,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                
                await interaction.reply({ embeds: [inviteEmbed] });
                
            } else if (type === 'server') {
                // Check if in guild
                if (!interaction.guild) {
                    return interaction.reply({
                        content: '[ERROR] Server invites can only be created in a server.',
                        flags: 64
                    });
                }
                
                // Check permissions
                if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.CreateInstantInvite)) {
                    return interaction.reply({
                        content: '[ERROR] I do not have permission to create invites.',
                        flags: 64
                    });
                }
                
                const maxAge = interaction.options.getInteger('max_age') || 0;
                const maxUses = interaction.options.getInteger('max_uses') || 0;
                const temporary = interaction.options.getBoolean('temporary') || false;
                
                // Create invite
                const invite = await interaction.channel.createInvite({
                    maxAge: maxAge,
                    maxUses: maxUses,
                    temporary: temporary,
                    reason: `Created by ${interaction.user.tag}`
                });
                
                const inviteEmbed = {
                    color: 0x00FF00,
                    title: '[SUCCESS] Invite Created',
                    description: `Invite for #${interaction.channel.name}`,
                    fields: [
                        {
                            name: '[LINK] Invite Link',
                            value: invite.url,
                            inline: false
                        },
                        {
                            name: '[INFO] Expires',
                            value: maxAge > 0 ? `In ${maxAge / 60} minute(s)` : 'Never',
                            inline: true
                        },
                        {
                            name: '[INFO] Max Uses',
                            value: maxUses > 0 ? `${maxUses} uses` : 'Unlimited',
                            inline: true
                        },
                        {
                            name: '[INFO] Temporary',
                            value: temporary ? 'Yes' : 'No',
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                
                await interaction.reply({ embeds: [inviteEmbed] });
                
                logger.info(`[INFO] Invite created by ${interaction.user.tag}: ${invite.url}`);
            }
            
        } catch (error) {
            logger.error('[ERROR] Invite command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while creating invite.',
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
