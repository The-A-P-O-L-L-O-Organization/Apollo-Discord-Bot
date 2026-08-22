// Temprole Command
// Assign temporary roles that automatically expire
import { logger } from './utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
import { logger } from '../../../utils/logger.js';
    name: 'temprole',
    description: 'Assign a temporary role that expires after a set duration',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageRoles,
    dmPermission: false,
    options: [
        {
            name: 'add',
            description: 'Add a temporary role',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'User to assign role to',
                    type: 6, // USER
                    required: true
                },
                {
                    name: 'role',
                    description: 'Role to assign',
                    type: 8, // ROLE
                    required: true
                },
                {
                    name: 'duration',
                    description: 'Duration (e.g., 1h, 30m, 7d)',
                    type: 3, // STRING
                    required: true
                },
                {
                    name: 'reason',
                    description: 'Reason for assignment',
                    type: 3, // STRING
                    required: false
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a temporary role early',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'User to remove role from',
                    type: 6, // USER
                    required: true
                },
                {
                    name: 'role',
                    description: 'Role to remove',
                    type: 8, // ROLE
                    required: true
                }
            ]
        },
        {
            name: 'list',
            description: 'List active temporary roles',
            type: 1 // SUB_COMMAND
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'add') {
                await handleAdd(interaction);
            } else if (subcommand === 'remove') {
                await handleRemove(interaction);
            } else if (subcommand === 'list') {
                await handleList(interaction);
            }
            
        } catch (error) {
            logger.error('[ERROR] Temprole command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while managing temporary roles.',
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

async function handleAdd(interaction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    // Parse duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Duration',
                description: 'Please use a valid duration format (e.g., 1h, 30m, 7d, 2w)',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
    
    // Check max duration (30 days)
    const maxDuration = 30 * 24 * 60 * 60 * 1000;
    if (durationMs > maxDuration) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Duration Too Long',
                description: 'Maximum duration is 30 days.',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
    
    // Get member
    const member = await interaction.guild.members.fetch(user.id);
    
    // Check if role can be assigned
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Role',
                description: 'I cannot assign roles higher than my highest role.',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
    
    // Assign role
    await member.roles.add(role, `Temporary role: ${reason}`);
    
    // Store temp role info
    const tempRoleData = {
        userId: user.id,
        userTag: user.tag,
        roleId: role.id,
        roleName: role.name,
        assignedBy: interaction.user.id,
        assignedByTag: interaction.user.tag,
        reason: reason,
        expiresAt: Date.now() + durationMs,
        assignedAt: Date.now()
    };
    
    await updateGuildData('temp-roles', interaction.guild.id, (data) => {
        data[user.id] = tempRoleData;
        return data;
    });
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Temporary Role Assigned',
        description: `${user.tag} has been assigned ${role} for ${durationStr}.`,
        fields: [
            {
                name: '[INFO] User',
                value: user.tag,
                inline: true
            },
            {
                name: '[INFO] Role',
                value: role.name,
                inline: true
            },
            {
                name: '[INFO] Duration',
                value: durationStr,
                inline: true
            },
            {
                name: '[INFO] Expires',
                value: `<t:${Math.floor(tempRoleData.expiresAt / 1000)}:R>`,
                inline: true
            },
            {
                name: '[INFO] Reason',
                value: reason,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed] });
    
    logger.info(`[MODERATION] Temp role ${role.name} assigned to ${user.tag} for ${durationStr}`);
}

async function handleRemove(interaction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    
    // Get member
    const member = await interaction.guild.members.fetch(user.id);
    
    // Remove role
    if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Temporary role removed early');
        
        // Clear from temp roles
        await updateGuildData('temp-roles', interaction.guild.id, (data) => {
            delete data[user.id];
            return data;
        });
        
        const successEmbed = {
            color: 0x00FF00,
            title: '[SUCCESS] Temporary Role Removed',
            description: `${role} has been removed from ${user.tag}.`,
            timestamp: new Date().toISOString()
        };
        
        await interaction.reply({ embeds: [successEmbed] });
    } else {
        return interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Temporary Role',
                description: `${user.tag} does not have ${role} assigned.`,
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
}

async function handleList(interaction) {
    const tempRoles = await getGuildData('temp-roles', interaction.guild.id);
    
    if (!tempRoles || Object.keys(tempRoles).length === 0) {
        return interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Active Temporary Roles',
                description: 'There are no active temporary roles.',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
    
    const now = Date.now();
    const activeRoles = Object.values(tempRoles).filter(r => r.expiresAt > now);
    
    if (activeRoles.length === 0) {
        return interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Active Temporary Roles',
                description: 'All temporary roles have expired.',
                timestamp: new Date().toISOString()
            }],
            flags: 64
        });
    }
    
    const listEmbed = {
        color: 0x3498DB,
        title: '[TEMPROLES] Active Temporary Roles',
        description: `Total: ${activeRoles.length}`,
        fields: activeRoles.slice(0, 10).map(r => ({
            name: `${r.roleName} - ${r.userTag}`,
            value: `Expires: <t:${Math.floor(r.expiresAt / 1000)}:R>\nReason: ${r.reason}`,
            inline: false
        })),
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [listEmbed], flags: 64 });
}

function parseDuration(str) {
    const match = str.match(/^(\d+)([mhdw])$/i);
    if (!match) {return null;}
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };
    
    return value * (multipliers[unit] || 0);
}
