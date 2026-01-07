// Mute Command
// Temporarily mutes a user by assigning a mute role

import { ApplicationCommandType, PermissionsBitField } from 'discord.js';

export default {
    name: 'mute',
    description: 'Temporarily mute a user',
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionsBitField.Flags.MuteMembers,
    dmPermission: false,
    
    async execute(interaction) {
        try {
            // Get the user to mute
            const user = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to mute.',
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
            
            // Check if the member can be muted
            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Mute',
                    description: 'I cannot mute this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the user is trying to mute themselves
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot mute yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Parse duration (supports: 1m, 1h, 1d, 1w)
            let durationMs = 3600000; // Default 1 hour
            let durationText = '1 hour';
            
            if (duration) {
                const match = duration.match(/^(\d+)([mhdw])$/);
                if (!match) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Duration',
                        description: 'Invalid duration format. Use: 1m (minutes), 1h (hours), 1d (days), 1w (weeks)',
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                
                const value = parseInt(match[1]);
                const unit = match[2];
                
                switch (unit) {
                    case 'm':
                        durationMs = value * 60000;
                        durationText = `${value} minute(s)`;
                        break;
                    case 'h':
                        durationMs = value * 3600000;
                        durationText = `${value} hour(s)`;
                        break;
                    case 'd':
                        durationMs = value * 86400000;
                        durationText = `${value} day(s)`;
                        break;
                    case 'w':
                        durationMs = value * 604800000;
                        durationText = `${value} week(s)`;
                        break;
                }
            }
            
            // Try to use Discord timeout first (more reliable)
            try {
                await member.timeout(durationMs, reason);
            } catch (timeoutError) {
                // Fallback to mute role if timeout fails
                console.log('[INFO] Timeout failed, checking for mute role...');
                
                // Find or create mute role
                let muteRole = interaction.guild.roles.cache.find(
                    role => role.name === 'Muted'
                );
                
                if (!muteRole) {
                    try {
                        muteRole = await interaction.guild.roles.create({
                            name: 'Muted',
                            permissions: [],
                            reason: 'Mute role for moderation bot'
                        });
                        console.log('[SUCCESS] Created Muted role');
                    } catch (roleError) {
                        console.error('[ERROR] Failed to create mute role:', roleError);
                        const errorEmbed = {
                            color: 0xFF0000,
                            title: '[ERROR] Mute Role Missing',
                            description: 'Could not find or create a "Muted" role. Please create it manually.',
                            timestamp: new Date().toISOString()
                        };
                        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
                
                // Add mute role to member
                await member.roles.add(muteRole, reason);
            }
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Muted',
                description: `${user.tag} has been muted.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Duration',
                        value: durationText,
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
            console.log(`[MODERATION] User ${user.tag} was muted by ${interaction.user.tag}. Duration: ${durationText}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Mute command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to mute the user.',
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

