import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    // Configure role persistence to restore roles when users rejoin
    name: 'rolepersistence',
    description: 'Configure role persistence for members who rejoin',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageRoles,
    dmPermission: false,
    options: [
        {
            name: 'toggle',
            description: 'Enable or disable role persistence',
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
            description: 'View current settings',
            type: 1 // SUB_COMMAND
        },
        {
            name: 'clear',
            description: 'Clear saved roles for a user',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'User to clear roles for',
                    type: 6, // USER
                    required: true
                }
            ]
        }
    ],
    
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'toggle') {
                await handleToggle(interaction);
            } else if (subcommand === 'view') {
                await handleView(interaction);
            } else if (subcommand === 'clear') {
                await handleClear(interaction);
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

async function handleToggle(interaction) {
    const enabled = interaction.options.getBoolean('enabled');
    
    const config = await getGuildData('role-persistence', interaction.guild.id) || {};
    config.enabled = enabled;
    
    await setGuildData('role-persistence', interaction.guild.id, config);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Role Persistence Updated',
        description: `Role persistence has been ${enabled ? 'enabled' : 'disabled'}.`,
        fields: [
            {
                name: '[INFO] Status',
                value: enabled ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: '[INFO] How it works',
                value: 'Roles will be saved when members leave and restored when they rejoin.',
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed] });
    
    logger.info(`[CONFIG] Role persistence ${enabled ? 'enabled' : 'disabled'} in ${interaction.guild.name}`);
}

async function handleView(interaction) {
    const config = await getGuildData('role-persistence', interaction.guild.id);
    
    const viewEmbed = {
        color: 0x3498DB,
        title: '[ROLE PERSISTENCE] Configuration',
        fields: [
            {
                name: '[INFO] Status',
                value: config && config.enabled ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: '[INFO] How it works',
                value: 'Roles will be saved when members leave and restored when they rejoin.',
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [viewEmbed], flags: MessageFlags.Ephemeral });
}

async function handleClear(interaction) {
    const user = interaction.options.getUser('user');
    
    const config = await getGuildData('role-persistence', interaction.guild.id);
    
    if (!config || !config.savedRoles) {
        return interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Saved Roles',
                description: `No roles are saved for ${user.tag}.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Remove saved roles for user
    delete config.savedRoles[user.id];
    await setGuildData('role-persistence', interaction.guild.id, config);
    
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Saved Roles Cleared',
        description: `Saved roles for ${user.tag} have been cleared.`,
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed] });
    
    logger.info(`[CONFIG] Saved roles cleared for ${user.tag} in ${interaction.guild.name}`);
}