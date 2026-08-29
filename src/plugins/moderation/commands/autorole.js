// Autorole Command
export default {
// Configure automatic role assignment for new members
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

    name: 'autorole',
    description: 'Configure automatic role assignment for new members',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageRoles,
    dmPermission: false,
    options: [
        {
            name: 'set',
            description: 'Set the auto-role for new members',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'role',
                    description: 'The role to assign',
                    type: 8, // ROLE type
                    required: true
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove the auto-role',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'toggle',
            description: 'Enable or disable auto-role',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'enabled',
                    description: 'Enable or disable',
                    type: 5, // BOOLEAN
                    required: true
                }
            ]
        },
        {
            name: 'view',
            description: 'View current auto-role settings',
            type: 1 // SUB_COMMAND
        }
    ],
    
    async execute(interaction) {
    try {

        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'set') {
                await handleSetRole(interaction);
            } else if (subcommand === 'remove') {
                await handleRemoveRole(interaction);
            } else if (subcommand === 'toggle') {
                await handleToggle(interaction);
            } else if (subcommand === 'view') {
                await handleView(interaction);
            }
            
        } catch (error) {
            logger.error('[ERROR] Autorole command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while configuring auto-role.',
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

async function handleSetRole(interaction) {
    const role = interaction.options.getRole('role');
    
    // Check if bot can assign the role
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Role',
                description: 'I cannot assign roles that are higher than or equal to my highest role.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Check if role is everyone
    if (role.name === '@everyone') {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Role',
                description: 'You cannot set @everyone as the auto-role.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Get current config
    const config = await getGuildData('autorole', interaction.guild.id) || {};
    
    // Set new role
    config.roleId = role.id;
    config.roleName = role.name;
    config.enabled = config.enabled !== undefined ? config.enabled : true;
    
    await setGuildData('autorole', interaction.guild.id, config);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Auto-Role Set',
        description: `New members will automatically receive the ${role} role.`,
        fields: [
            {
                name: '[INFO] Role',
                value: role.name,
                inline: true
            },
            {
                name: '[INFO] Status',
                value: config.enabled ? 'Enabled' : 'Disabled',
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed] });
    
    logger.info(`[CONFIG] Auto-role set to ${role.name} in ${interaction.guild.name}`);
}

async function handleRemoveRole(interaction) {
    const config = await getGuildData('autorole', interaction.guild.id);
    
    if (!config || !config.roleId) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] No Auto-Role',
                description: 'There is no auto-role configured.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Remove role config
    config.roleId = null;
    config.roleName = null;
    
    await setGuildData('autorole', interaction.guild.id, config);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Auto-Role Removed',
        description: 'Auto-role has been removed.',
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed] });
    
    logger.info(`[CONFIG] Auto-role removed in ${interaction.guild.name}`);
}

async function handleToggle(interaction) {
    const enabled = interaction.options.getBoolean('enabled');
    
    const config = await getGuildData('autorole', interaction.guild.id) || {};
    
    if (!config.roleId) {
        return interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] No Auto-Role',
                description: 'Please set an auto-role first.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    config.enabled = enabled;
    await setGuildData('autorole', interaction.guild.id, config);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Auto-Role Updated',
        description: `Auto-role has been ${enabled ? 'enabled' : 'disabled'}.`,
        fields: [
            {
                name: '[INFO] Role',
                value: config.roleName,
                inline: true
            },
            {
                name: '[INFO] Status',
                value: enabled ? 'Enabled' : 'Disabled',
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed] });
}

async function handleView(interaction) {
    const config = await getGuildData('autorole', interaction.guild.id);
    
    if (!config || !config.roleId) {
        return interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] Auto-Role Not Configured',
                description: 'Use `/autorole set` to configure auto-role.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    const role = interaction.guild.roles.cache.get(config.roleId);
    
    const viewEmbed = {
        color: 0x3498DB,
        title: '[AUTOROLE] Configuration',
        fields: [
            {
                name: '[INFO] Role',
                value: role ? `${role}` : config.roleName,
                inline: true
            },
            {
                name: '[INFO] Status',
                value: config.enabled ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: '[INFO] Members Assigned',
                value: role ? `${role.members.size} member(s)` : 'N/A',
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [viewEmbed], flags: MessageFlags.Ephemeral });
}
