import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { PermissionsBitField, EmbedBuilder, MessageFlags } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'roleinfo',
    description: 'Display detailed information about a role',
    category: 'Utility',

    dmPermission: false,
    options: [
        { name: 'role', description: 'The role to get information about', type: 8, required: true }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const role = interaction.options.getRole('role') as Role;

            if (!role) {
                await interaction.reply({ content: t('roleinfo.notFound'), flags: MessageFlags.Ephemeral });
                return;
            }

            const permissions = new PermissionsBitField(role.permissions.bitfield ?? role.permissions);
            const permissionList = permissions.toArray();

            const memberCount = interaction.guild!.members.cache.filter(
                member => member.roles.cache.has(role.id)
            ).size;

            const roleEmbed = new EmbedBuilder()
                .setColor(role.color || 0x3498DB)
                .setTitle(t('roleinfo.title', { name: role.name }))
                .setDescription(role.name === '@everyone' ? t('roleinfo.everyone') : null)
                .addFields(
                    { name: t('roleinfo.id'), value: role.id, inline: true },
                    { name: t('roleinfo.color'), value: role.color ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` : t('roleinfo.default'), inline: true },
                    { name: t('roleinfo.hoisted'), value: role.hoist ? t('roleinfo.yes') : t('roleinfo.no'), inline: true },
                    { name: t('roleinfo.mentionable'), value: role.mentionable ? t('roleinfo.yes') : t('roleinfo.no'), inline: true },
                    { name: t('roleinfo.position'), value: `${role.position}/${interaction.guild!.roles.cache.size}`, inline: true },
                    { name: t('roleinfo.members'), value: t('roleinfo.membersValue', { count: memberCount }), inline: true },
                    { name: t('roleinfo.created'), value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: true },
                    { name: t('roleinfo.permissions'), value: permissionList.length > 0 ? permissionList.map(p => `• ${p.replace(/_/g, ' ').toLowerCase()}`).join('\n') : t('roleinfo.none'), inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [roleEmbed] });
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