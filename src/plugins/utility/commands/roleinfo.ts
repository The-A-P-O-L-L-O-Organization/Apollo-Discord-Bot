import { ChatInputCommandInteraction, PermissionsBitField, EmbedBuilder, MessageFlags, Role } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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
            const role = interaction.options.getRole('role') as Role;
            
            if (!role) {
                await interaction.reply({ content: '[ERROR] Could not find that role.', flags: MessageFlags.Ephemeral });
                return;
            }
            
            const permissions = new PermissionsBitField(role.permissions.bitfield ?? role.permissions);
            const permissionList = permissions.toArray();
            
            const memberCount = interaction.guild!.members.cache.filter(
                member => member.roles.cache.has(role.id)
            ).size;
            
            const roleEmbed = new EmbedBuilder()
                .setColor(role.color || 0x3498DB)
                .setTitle(`[ROLE] ${role.name}`)
                .setDescription(role.name === '@everyone' ? 'The default everyone role' : null)
                .addFields(
                    { name: '[INFO] ID', value: role.id, inline: true },
                    { name: '[INFO] Color', value: role.color ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` : 'Default', inline: true },
                    { name: '[INFO] Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                    { name: '[INFO] Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                    { name: '[INFO] Position', value: `${role.position}/${interaction.guild!.roles.cache.size}`, inline: true },
                    { name: '[INFO] Members', value: `${memberCount} member(s)`, inline: true },
                    { name: '[INFO] Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: true },
                    { name: '[PERMISSIONS]', value: permissionList.length > 0 ? permissionList.map(p => `• ${p.replace(/_/g, ' ').toLowerCase()}`).join('\n') : 'None', inline: false }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [roleEmbed] });
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