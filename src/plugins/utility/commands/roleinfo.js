// Roleinfo Command
export default {
// Display detailed information about a role
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField, MessageFlags } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

    name: 'roleinfo',
    description: 'Display detailed information about a role',
    category: 'Utility',
    
    dmPermission: false,
    options: [
        {
            name: 'role',
            description: 'The role to get information about',
            type: 8, // ROLE type
            required: true
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const role = interaction.options.getRole('role');
            
            // Calculate permissions
            const permissions = new PermissionsBitField(role.permissions);
            const permissionList = permissions.toArray();
            
            // Count members with this role
            const memberCount = interaction.guild.members.cache.filter(
                member => member.roles.cache.has(role.id)
            ).size;
            
            // Create role info embed
            const roleEmbed = {
                color: role.color || 0x3498DB,
                title: `[ROLE] ${role.name}`,
                description: role.name === '@everyone' ? 'The default everyone role' : null,
                fields: [
                    {
                        name: '[INFO] ID',
                        value: role.id,
                        inline: true
                    },
                    {
                        name: '[INFO] Color',
                        value: role.color ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` : 'Default',
                        inline: true
                    },
                    {
                        name: '[INFO] Hoisted',
                        value: role.hoist ? 'Yes' : 'No',
                        inline: true
                    },
                    {
                        name: '[INFO] Mentionable',
                        value: role.mentionable ? 'Yes' : 'No',
                        inline: true
                    },
                    {
                        name: '[INFO] Position',
                        value: `${role.position}/${interaction.guild.roles.cache.size}`,
                        inline: true
                    },
                    {
                        name: '[INFO] Members',
                        value: `${memberCount} member(s)`,
                        inline: true
                    },
                    {
                        name: '[INFO] Created',
                        value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`,
                        inline: true
                    },
                    {
                        name: '[PERMISSIONS]',
                        value: permissionList.length > 0 ? permissionList.map(p => `• ${p.replace(/_/g, ' ').toLowerCase()}`).join('\n') : 'None',
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [roleEmbed] });
            
        } catch (error) {
            logger.error('[ERROR] Roleinfo command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while getting role information.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
