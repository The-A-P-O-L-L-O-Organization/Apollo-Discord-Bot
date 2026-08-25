import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { getUserData, setUserData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'unmute',
    description: 'Unmute a previously muted user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.MuteMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to unmute',
            type: 6,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for unmuting',
            type: 3,
            required: false
        }
    ],

    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to unmute.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Member Not Found',
                    description: 'This user is not a member of the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Unmute',
                    description: 'I cannot unmute this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot unmute yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.isCommunicationDisabled() && !member.roles.cache.some(role => role.name === 'Muted')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Not Muted',
                    description: 'This user is not currently muted.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            try {
                if (member.isCommunicationDisabled()) {
                    await member.timeout(null, reason);
                }
            } catch (timeoutError) {
                logger.info('[INFO] Timeout removal failed, checking for mute role...');
            }

            const muteRole = interaction.guild.roles.cache.find(
                role => role.name === 'Muted'
            );

            if (muteRole && member.roles.cache.has(muteRole.id)) {
                await member.roles.remove(muteRole, reason);
            }

            const savedRoles = await getUserData('muted-roles', interaction.guild.id, user.id);
            if (savedRoles && savedRoles.roles && Array.isArray(savedRoles.roles)) {
                const rolesToRestore = savedRoles.roles.filter(roleId => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    return role && roleId !== interaction.guild.id && role.name !== 'Muted';
                });

                if (rolesToRestore.length > 0) {
                    try {
                        await member.roles.add(rolesToRestore, 'Restoring roles after unmute');
                        logger.info(`[SUCCESS] Restored ${rolesToRestore.length} roles for ${user.tag}`);
                    } catch (roleError) {
                        logger.error('[ERROR] Failed to restore some roles:', roleError);
                    }
                }

                await setUserData('muted-roles', interaction.guild.id, user.id, null);
            }

            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Unmuted',
                description: `${user.tag} has been unmuted.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: true
                    },
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild, {
                action: 'unmute',
                target: user,
                moderator: interaction.user,
                reason: reason
            });

            logger.info(`[MODERATION] User ${user.tag} was unmuted by ${interaction.user.tag}. Reason: ${reason}`);

        } catch (error) {
            logger.error('[ERROR] Unmute command error:', error);

            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to unmute the user.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};