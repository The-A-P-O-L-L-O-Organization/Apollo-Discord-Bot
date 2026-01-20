// User Info Command
// Displays detailed information about a user

import { EmbedBuilder } from 'discord.js';

export default {
    name: 'userinfo',
    description: 'Displays information about a user',
    category: 'Utility',
    
    options: [
        {
            name: 'user',
            type: 6, // USER type
            description: 'The user to get information about',
            required: false
        }
    ],
    
    async execute(interaction) {
        // Get the target user (mention or self)
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild.members.cache.get(targetUser.id) || 
                      await interaction.guild.members.fetch(targetUser.id);
        
        if (!member) {
            await interaction.reply({
                content: '[ERROR] Could not find that user in this server.',
                ephemeral: true
            });
            return;
        }
        
        // Calculate account age
        const accountAge = Date.now() - targetUser.createdTimestamp;
        const daysOld = Math.floor(accountAge / (1000 * 60 * 60 * 24));
        
        // Calculate server join age
        const joinAge = Date.now() - member.joinedTimestamp;
        const daysInServer = Math.floor(joinAge / (1000 * 60 * 60 * 24));
        
        // Get user status (if available)
        const status = member.presence?.status || 'offline';
        let statusIndicator;
        if (status === 'online') {
            statusIndicator = '[ONLINE]';
        } else if (status === 'idle') {
            statusIndicator = '[IDLE]';
        } else if (status === 'dnd') {
            statusIndicator = '[DND]';
        } else {
            statusIndicator = '[OFFLINE]';
        }
        
        // Get top role
        const topRole = member.roles.highest;
        
        // Count roles (excluding @everyone)
        const roleCount = member.roles.cache.size - 1;
        
        // Create user info embed
        const userInfoEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`User Information - ${statusIndicator}`)
            .setThumbnail(targetUser.displayAvatarURL({ 
                dynamic: true, 
                size: 256 
            }))
            .addFields(
                {
                    name: 'Username',
                    value: `**${targetUser.username}**${targetUser.discriminator !== '0' ? `#${targetUser.discriminator}` : ''}`,
                    inline: true
                },
                {
                    name: 'User ID',
                    value: `\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: 'Bot',
                    value: targetUser.bot ? 'Yes' : 'No',
                    inline: true
                },
                {
                    name: 'Account Created',
                    value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>\n(${daysOld} days ago)`,
                    inline: true
                },
                {
                    name: 'Joined Server',
                    value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(${daysInServer} days ago)`,
                    inline: true
                },
                {
                    name: 'Status',
                    value: statusIndicator,
                    inline: true
                }
            )
            .addFields(
                {
                    name: 'Top Role',
                    value: topRole.toString(),
                    inline: true
                },
                {
                    name: 'Role Count',
                    value: roleCount > 0 ? `${roleCount} role(s)` : 'None',
                    inline: true
                },
                {
                    name: 'Position',
                    value: `${member.joinedTimestamp ? 
                        (interaction.guild.members.cache.filter(m => m.joinedTimestamp).sort((a, b) => a.joinedTimestamp - b.joinedTimestamp).map(m => m.id).indexOf(member.id) + 1) : 
                        'Unknown'} of ${interaction.guild.memberCount}`,
                    inline: true
                }
            );
        
        // Add role color if available
        if (member.displayColor !== 0) {
            userInfoEmbed.setColor(member.displayHexColor);
        }
        
        // Add footer and timestamp
        userInfoEmbed.setFooter({
            text: `Requested by ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        }).setTimestamp();
        
        // Send the embed
        await interaction.reply({ embeds: [userInfoEmbed] });
        
        console.log(`[SUCCESS] Userinfo command executed by ${interaction.user.tag} for ${targetUser.tag}`);
    }
};

