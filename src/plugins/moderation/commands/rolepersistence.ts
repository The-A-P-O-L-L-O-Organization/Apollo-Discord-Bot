// Role Persistence Command - Configure role persistence for members who rejoin
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface RolePersistenceConfig {
    enabled?: boolean;
    savedRoles?: Record<string, string[]>;
    [key: string]: unknown;
}

export default {
    // Configure role persistence to restore roles when users rejoin
    name: 'rolepersistence',
    description: 'Configure role persistence for members who rejoin',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
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

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
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
            const errorMessage = handleDiscordError(error) ?? t('rolepersistence.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

async function handleToggle(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const enabled = interaction.options.getBoolean('enabled', true);

    const config = (await getGuildData('role-persistence', interaction.guild!.id)) as RolePersistenceConfig || {};
    config.enabled = enabled;

    await setGuildData('role-persistence', interaction.guild!.id, config);

    const successEmbed = {
        color: 0x00FF00,
        title: t('rolepersistence.successRolePersistenceUpdated'),
        description: t('rolepersistence.rolePersistenceHasBeenValue', { value: enabled ? 'enabled' : 'disabled' }),
        fields: [
            {
                name: t('rolepersistence.infoStatus'),
                value: enabled ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: t('rolepersistence.infoHowItWorks'),
                value: t('rolepersistence.rolesWillBeSavedWhen'),
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });

    logger.info({ msg: `[CONFIG] Role persistence ${enabled ? 'enabled' : 'disabled'} in ${interaction.guild!.name}` });
}

async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const config = (await getGuildData('role-persistence', interaction.guild!.id)) as RolePersistenceConfig | undefined;

    const viewEmbed = {
        color: 0x3498DB,
        title: t('rolepersistence.rolePersistenceConfiguration'),
        fields: [
            {
                name: t('rolepersistence.infoStatus2'),
                value: config?.enabled ? 'Enabled' : 'Disabled',
                inline: true
            },
            {
                name: t('rolepersistence.infoHowItWorks2'),
                value: t('rolepersistence.rolesWillBeSavedWhen2'),
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [viewEmbed], flags: MessageFlags.Ephemeral });
}

async function handleClear(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const user = interaction.options.getUser('user', true);

    const config = (await getGuildData('role-persistence', interaction.guild!.id)) as RolePersistenceConfig | undefined;

    if (!config?.savedRoles) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: t('rolepersistence.infoNoSavedRoles'),
                description: t('rolepersistence.noRolesAreSavedFor', { user: user.tag }),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Remove saved roles for user
    delete config.savedRoles[user.id];
    await setGuildData('role-persistence', interaction.guild!.id, config);

    const successEmbed = {
        color: 0x00FF00,
        title: t('rolepersistence.successSavedRolesCleared'),
        description: t('rolepersistence.savedRolesForUserHave', { user: user.tag }),
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });

    logger.info({ msg: `[CONFIG] Saved roles cleared for ${user.tag} in ${interaction.guild!.name}` });
}