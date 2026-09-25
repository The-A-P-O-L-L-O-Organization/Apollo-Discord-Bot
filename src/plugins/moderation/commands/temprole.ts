// Temprole Command - Assign a temporary role that expires after a set duration
import type { ChatInputCommandInteraction, Role} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface TempRoleData {
    userId: string;
    userTag: string;
    roleId: string;
    roleName: string;
    assignedBy: string;
    assignedByTag: string;
    reason: string;
    expiresAt: number;
    assignedAt: number;
}

export default {
    name: 'temprole',
    description: 'Assign a temporary role that expires after a set duration',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageRoles,
    dmPermission: false,
    options: [
        {
            name: 'add',
            description: 'Add a temporary role',
            type: 1,
            options: [
                { name: 'user', description: 'User to assign role to', type: 6, required: true },
                { name: 'role', description: 'Role to assign', type: 8, required: true },
                { name: 'duration', description: 'Duration (e.g., 1h, 30m, 7d)', type: 3, required: true },
                { name: 'reason', description: 'Reason for assignment', type: 3, required: false }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a temporary role early',
            type: 1,
            options: [
                { name: 'user', description: 'User to remove role from', type: 6, required: true },
                { name: 'role', description: 'Role to remove', type: 8, required: true }
            ]
        },
        {
            name: 'list',
            description: 'List active temporary roles',
            type: 1
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
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
            const errorMessage = handleDiscordError(error) ?? t('temprole.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

async function handleAdd(interaction: ChatInputCommandInteraction) {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration') ?? '';
    const reason = interaction.options.getString('reason') ?? t('temprole.noReason');

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('temprole.errorInvalidDuration'),
                description: t('temprole.pleaseUseAValidDuration'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const maxDuration = 30 * 24 * 60 * 60 * 1000;
    if (durationMs > maxDuration) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('temprole.errorDurationTooLong'),
                description: t('temprole.maximumDurationIsDays'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const member = await interaction.guild!.members.fetch(user!.id);

    if (role!.position >= interaction.guild!.members.me!.roles.highest.position) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('temprole.errorInvalidRole'),
                description: t('temprole.iCannotAssignRolesHigher'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await member.roles.add(role as Role, `Temporary role: ${reason}`);

    const tempRoleData: TempRoleData = {
        userId: user!.id,
        userTag: user!.tag,
        roleId: role!.id,
        roleName: role!.name,
        assignedBy: interaction.user.id,
        assignedByTag: interaction.user.tag,
        reason: reason,
        expiresAt: Date.now() + durationMs,
        assignedAt: Date.now()
    };

    await updateGuildData('temp-roles', interaction.guild!.id, (data: Record<string, unknown>) => {
        (data as Record<string, TempRoleData>)[user!.id] = tempRoleData;
        return data;
    });

    const successEmbed = {
        color: 0x00FF00,
        title: t('temprole.successTemporaryRoleAssigned'),
        description: t('temprole.valueHasBeenAssignedValue2', { value: user!.tag, value2: role!.id, duration: durationStr }),
        fields: [
            { name: t('temprole.infoUser'), value: user!.tag, inline: true },
            { name: t('temprole.infoRole'), value: role!.name, inline: true },
            { name: t('temprole.fieldDuration'), value: durationStr, inline: true },
            { name: t('temprole.infoExpires'), value: t('temprole.tValueR', { value: Math.floor(tempRoleData.expiresAt / 1000) }), inline: true },
            { name: t('temprole.fieldReason'), value: reason, inline: false }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });
    logger.info({ msg: `[MODERATION] Temp role ${role!.name} assigned to ${user!.tag} for ${durationStr}` });
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    const member = await interaction.guild!.members.fetch(user!.id);

    if (member.roles.cache.has(role!.id)) {
        await member.roles.remove(role as Role, 'Temporary role removed early');

        await updateGuildData('temp-roles', interaction.guild!.id, (data: Record<string, unknown>) => {
            delete (data as Record<string, TempRoleData>)[user!.id];
            return data;
        });

        const successEmbed = {
            color: 0x00FF00,
            title: t('temprole.successTemporaryRoleRemoved'),
            description: t('temprole.valueHasBeenRemovedFrom', { value: role!.id, value2: user!.tag }),
            timestamp: new Date().toISOString()
        };

        await interaction.reply({ embeds: [successEmbed] });
    } else {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: t('temprole.infoNoTemporaryRole'),
                description: t('temprole.valueDoesNotHaveValue2', { value: user!.tag, value2: role!.id }),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
}

async function handleList(interaction: ChatInputCommandInteraction) {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const tempRoles = (await getGuildData('temp-roles', interaction.guild!.id)) as Record<string, TempRoleData> | null;

    if (!tempRoles || Object.keys(tempRoles).length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: t('temprole.infoNoActiveTemporaryRoles'),
                description: t('temprole.thereAreNoActiveTemporary'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const now = Date.now();
    const activeRoles = Object.values(tempRoles).filter(r => r.expiresAt > now);

    if (activeRoles.length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: t('temprole.infoNoActiveTemporaryRoles2'),
                description: t('temprole.allTemporaryRolesHaveExpired'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const listEmbed = {
        color: 0x3498DB,
        title: t('temprole.temprolesActiveTemporaryRoles'),
        description: t('temprole.totalCount', { count: activeRoles.length }),
        fields: activeRoles.slice(0, 10).map(r => ({
            name: t('temprole.roleValue', { role: r.roleName, value: r.userTag }),
            value: t('temprole.expiresTValueRNreason', { value: Math.floor(r.expiresAt / 1000), reason: r.reason }),
            inline: false
        })),
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [listEmbed], flags: MessageFlags.Ephemeral });
}

function parseDuration(str: string): number | null {
    const match = /^(\d+)([mhdw])$/i.exec(str);
    if (!match?.[1] || !match[2]) { return null; }

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers: Record<string, number> = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return value * (multipliers[unit] ?? 0);
}