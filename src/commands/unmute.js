// Unmute Command
// Unmutes a previously muted user

import { ApplicationCommandType, PermissionsBitField } from 'discord.js';

export default {
    name: 'unmute',
    description: 'Unmute a previously muted user',
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionsBitField.Flags.MuteMembers,
    dmPermission: false,
    
    async execute(interaction) {
        try {
            // Get the user to unmute
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to unmute.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Get the guild member
            const member = interaction.guild.members.cache.get(user.id);
            
            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Member Not Found',
                    description: 'This user is not a member of the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the member can be unmuted
            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Unmute',
                    description: 'I cannot unmute this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the user is trying to unmute themselves
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot unmute yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the member is actually muted/timed out
            if (!member.isCommunicationDisabled() && !member.roles.cache.some(role => role.name === 'Muted')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Not Muted',
                    description: 'This user is not currently muted.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Try to remove timeout first (more reliable)
            try {
                if (member.isCommunicationDisabled()) {
                    await member.timeout(null, reason);
                }
            } catch (timeoutError) {
                console.log('[INFO] Timeout removal failed, checking for mute role...');
            }
            
            // Also remove mute role if it exists
            const muteRole = interaction.guild.roles.cache.find(
                role => role.name === 'Muted'
            );
            
            if (muteRole && member.roles.cache.has(muteRole.id)) {
                await member.roles.remove(muteRole, reason);
            }
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Unmuted',
                description: `${user.tag} has been unmuted.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: true
                    },
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Log the action
            console.log(`[MODERATION] User ${user.tag} was unmuted by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Unmute command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to unmute the user.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

