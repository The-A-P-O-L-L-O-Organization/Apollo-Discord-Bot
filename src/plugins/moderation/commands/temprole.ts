// Temprole Command - Assign a temporary role that expires after a set duration
import type { ChatInputCommandInteraction, Role} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

async function handleAdd(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration') ?? '';
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: '[ERROR] Invalid Duration',
                description: 'Please use a valid duration format (e.g., 1h, 30m, 7d, 2w)',
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
                title: '[ERROR] Duration Too Long',
                description: 'Maximum duration is 30 days.',
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
                title: '[ERROR] Invalid Role',
                description: 'I cannot assign roles higher than my highest role.',
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
        title: '[SUCCESS] Temporary Role Assigned',
        description: `${user!.tag} has been assigned <@&${role!.id}> for ${durationStr}.`,
        fields: [
            { name: '[INFO] User', value: user!.tag, inline: true },
            { name: '[INFO] Role', value: role!.name, inline: true },
            { name: '[INFO] Duration', value: durationStr, inline: true },
            { name: '[INFO] Expires', value: `<t:${Math.floor(tempRoleData.expiresAt / 1000)}:R>`, inline: true },
            { name: '[INFO] Reason', value: reason, inline: false }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed] });
    logger.info({ msg: `[MODERATION] Temp role ${role!.name} assigned to ${user!.tag} for ${durationStr}` });
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
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
            title: '[SUCCESS] Temporary Role Removed',
            description: `<@&${role!.id}> has been removed from ${user!.tag}.`,
            timestamp: new Date().toISOString()
        };

        await interaction.reply({ embeds: [successEmbed] });
    } else {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Temporary Role',
                description: `${user!.tag} does not have <@&${role!.id}> assigned.`,
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
}

async function handleList(interaction: ChatInputCommandInteraction) {
    const tempRoles = (await getGuildData('temp-roles', interaction.guild!.id)) as Record<string, TempRoleData> | null;

    if (!tempRoles || Object.keys(tempRoles).length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFA500,
                title: '[INFO] No Active Temporary Roles',
                description: 'There are no active temporary roles.',
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
                title: '[INFO] No Active Temporary Roles',
                description: 'All temporary roles have expired.',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
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