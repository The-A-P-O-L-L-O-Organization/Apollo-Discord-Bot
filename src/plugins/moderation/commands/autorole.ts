// Autorole Command
import { ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface AutoRoleConfig {
    roleId?: string | null;
    roleName?: string | null;
    enabled?: boolean;
    [key: string]: unknown;
}

export default {
    name: 'autorole',
    description: 'Configure automatic role assignment for new members',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
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

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
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
            logger.error({ err: error, msg: '[ERROR] Autorole command error' });

            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while configuring auto-role.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: (error as Error).message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};

async function handleSetRole(interaction: ChatInputCommandInteraction): Promise<void> {
    const role = interaction.options.getRole('role', true);

    // Check if bot can assign the role
    if (role.position >= interaction.guild!.members.me.roles.highest.position) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Role',
                description: 'I cannot assign roles that are higher than or equal to my highest role.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Check if role is everyone
    if (role.name === '@everyone') {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Role',
                description: 'You cannot set @everyone as the auto-role.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Get current config
    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig || {};

    // Set new role
    config.roleId = role.id;
    config.roleName = role.name;
    config.enabled = config.enabled !== undefined ? config.enabled : true;

    await setGuildData('autorole', interaction.guild!.id, config);

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

    logger.info({ msg: `[CONFIG] Auto-role set to ${role.name} in ${interaction.guild!.name}` });
}

async function handleRemoveRole(interaction: ChatInputCommandInteraction): Promise<void> {
    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig | undefined;

    if (!config || !config.roleId) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] No Auto-Role',
                description: 'There is no auto-role configured.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Remove role config
    config.roleId = null;
    config.roleName = null;

    await setGuildData('autorole', interaction.guild!.id, config);

    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Auto-Role Removed',
        description: 'Auto-role has been removed.',
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });

    logger.info({ msg: `[CONFIG] Auto-role removed in ${interaction.guild!.name}` });
}

async function handleToggle(interaction: ChatInputCommandInteraction): Promise<void> {
    const enabled = interaction.options.getBoolean('enabled', true);

    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig || {};

    if (!config.roleId) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] No Auto-Role',
                description: 'Please set an auto-role first.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    config.enabled = enabled;
    await setGuildData('autorole', interaction.guild!.id, config);

    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Auto-Role Updated',
        description: `Auto-role has been ${enabled ? 'enabled' : 'disabled'}.`,
        fields: [
            {
                name: '[INFO] Role',
                value: config.roleName ?? 'Unknown',
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

async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig | undefined;

    if (!config || !config.roleId) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] Auto-Role Not Configured',
                description: 'Use `/autorole set` to configure auto-role.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const role = interaction.guild!.roles.cache.get(config.roleId);

    const viewEmbed = {
        color: 0x3498DB,
        title: '[AUTOROLE] Configuration',
        fields: [
            {
                name: '[INFO] Role',
                value: role ? `${role}` : (config.roleName ?? 'Unknown'),
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