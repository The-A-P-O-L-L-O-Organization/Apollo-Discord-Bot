import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { getUserData, setUserData } from '../../../utils/db.js';
import { i18n } from '../../../i18n/index.js';

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

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('unmute.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unmute.missingUserTitle'),
                    description: t('unmute.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unmute.memberNotFoundTitle'),
                    description: t('unmute.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unmute.errorCannotUnmute'),
                    description: t('unmute.iCannotUnmuteThisUser'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unmute.selfActionTitle'),
                    description: t('unmute.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (!member.isCommunicationDisabled() && !member.roles.cache.some(role => role.name === 'Muted')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unmute.errorNotMuted'),
                    description: t('unmute.thisUserIsNotCurrently'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            try {
                if (member.isCommunicationDisabled()) {
                    await member.timeout(null, reason);
                }
            } catch {
                logger.info({ msg: '[INFO] Timeout removal failed, checking for mute role...' });
            }

            const muteRole = interaction.guild!.roles.cache.find(
                role => role.name === 'Muted'
            );

            if (muteRole && member.roles.cache.has(muteRole.id)) {
                await member.roles.remove(muteRole, reason);
            }

            const savedRoles = await getUserData('muted-roles', interaction.guild!.id, user.id);
            if (savedRoles?.['roles'] && Array.isArray(savedRoles['roles'])) {
                const rolesToRestore = savedRoles['roles'].filter((roleId: string) => {
                    const role = interaction.guild!.roles.cache.get(roleId);
                    return role && roleId !== interaction.guild!.id && role.name !== 'Muted';
                });

                if (rolesToRestore.length > 0) {
                    try {
                        await member.roles.add(rolesToRestore, 'Restoring roles after unmute');
                        logger.info({ msg: `[SUCCESS] Restored ${rolesToRestore.length} roles for ${user.tag}` });
                    } catch (roleError) {
                        logger.error({ msg: '[ERROR] Failed to restore some roles:', err: roleError });
                    }
                }

                await setUserData('muted-roles', interaction.guild!.id, user.id, null);
            }

            const successEmbed = {
                color: 0x00FF00,
                title: t('unmute.successUserUnmuted'),
                description: t('unmute.userHasBeenUnmuted', { user: user.tag }),
                fields: [
                    {
                        name: t('unmute.fieldModerator'),
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: t('unmute.fieldReason'),
                        value: reason,
                        inline: true
                    },
                    {
                        name: t('unmute.fieldUserId'),
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'unmute',
                target: user,
                moderator: interaction.user,
                reason: reason
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was unmuted by ${interaction.user.tag}. Reason: ${reason}` });

        } catch (error) {
            logger.error({ msg: '[ERROR] Unmute command error:', err: error });

            const errorEmbed = {
                color: 0xFF0000,
                title: t('unmute.commandFailedTitle'),
                description: t('unmute.commandFailedDescription'),
                fields: [
                    {
                        name: t('unmute.errorDetails'),
                        value: (error as Error).message,
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