// Autorole Command
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { i18n } from '../../../i18n/index.js';

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
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
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
                title: t('autorole.commandFailedTitle'),
                description: t('autorole.anErrorOccurredWhileConfiguring'),
                fields: [
                    {
                        name: t('autorole.errorDetails'),
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
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const role = interaction.options.getRole('role', true);

    // Check if bot can assign the role
    if (role.position >= interaction.guild!.members.me!.roles.highest.position) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('autorole.errorInvalidRole'),
                description: t('autorole.iCannotAssignRolesThat'),
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
                title: t('autorole.errorInvalidRole2'),
                description: t('autorole.youCannotSetEveryoneAs'),
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
    config.enabled ??= true;

    await setGuildData('autorole', interaction.guild!.id, config);

    const successEmbed = {
        color: 0x00FF00,
        title: t('autorole.successAutoRoleSet'),
        description: t('autorole.newMembersWillAutomaticallyReceive', { roleId: role.id }),
        fields: [
            {
                name: t('autorole.infoRole'),
                value: role.name,
                inline: true
            },
            {
                name: t('autorole.infoStatus'),
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
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig | undefined;

    if (!config?.roleId) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('autorole.errorNoAutoRole'),
                description: t('autorole.thereIsNoAutoRole'),
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
        title: t('autorole.successAutoRoleRemoved'),
        description: t('autorole.autoRoleHasBeenRemoved'),
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });

    logger.info({ msg: `[CONFIG] Auto-role removed in ${interaction.guild!.name}` });
}

async function handleToggle(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const enabled = interaction.options.getBoolean('enabled', true);

    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig || {};

    if (!config.roleId) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('autorole.errorNoAutoRole2'),
                description: t('autorole.pleaseSetAnAutoRole'),
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
        title: t('autorole.successAutoRoleUpdated'),
        description: t('autorole.autoRoleHasBeenValue', { value: enabled ? 'enabled' : 'disabled' }),
        fields: [
            {
                name: t('autorole.infoRole2'),
                value: config.roleName ?? t('autorole.unknown'),
                inline: true
            },
            {
                name: t('autorole.infoStatus2'),
                value: enabled ? 'Enabled' : 'Disabled',
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });
}

async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const config = (await getGuildData('autorole', interaction.guild!.id)) as AutoRoleConfig | undefined;

    if (!config?.roleId) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: t('autorole.infoAutoRoleNotConfigured'),
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
        title: t('autorole.autoroleConfiguration'),
        fields: [
            {
                name: t('autorole.infoRole3'),
                value: role ? `<@&${role.id}>` : (config.roleName ?? t('autorole.unknown2')),
                inline: true
            },
            {
                name: t('autorole.infoStatus3'),
                value: config.enabled ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: t('autorole.infoMembersAssigned'),
                value: role ? `${role.members.size} member(s)` : 'N/A',
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [viewEmbed], flags: MessageFlags.Ephemeral });
}