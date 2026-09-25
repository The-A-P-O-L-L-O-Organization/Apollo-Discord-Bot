// Nickname Command - Force nickname changes for users
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Force nickname changes for users
    name: 'nickname',
    description: 'Change a user\'s nickname',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ManageNicknames,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user whose nickname to change',
            type: 6, // USER type
            required: true
        },
        {
            name: 'nickname',
            description: 'The new nickname (leave empty to reset)',
            type: 3, // STRING type
            required: false,
            max_length: 32
        },
        {
            name: 'reason',
            description: 'The reason for changing the nickname',
            type: 3, // STRING type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            // Get options
            const user = interaction.options.getUser('user');
            const nickname = interaction.options.getString('nickname');
            const reason = interaction.options.getString('reason') ?? t('nickname.noReason');

            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('nickname.missingUserTitle'),
                    description: t('nickname.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Get the guild member
            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('nickname.memberNotFoundTitle'),
                    description: t('nickname.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Check if the member's nickname can be changed
            if (!member.manageable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('nickname.errorCannotChangeNickname'),
                    description: t('nickname.iCannotChangeThisUser'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Check if the user is trying to change their own nickname when they shouldn't
            if (user.id === interaction.guild!.ownerId && interaction.user.id !== interaction.guild!.ownerId) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('nickname.errorCannotChangeNickname2'),
                    description: t('nickname.youCannotChangeTheServer'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Store old nickname
            const oldNickname = member.nickname ?? member.user.username;

            // Change nickname
            await member.setNickname(nickname ?? null,
                `Nickname change by ${interaction.user.tag}: ${reason}`);

            // Format new nickname
            const newNickname = nickname ?? user.username;
            const action = nickname ? 'changed' : 'reset';

            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: t('nickname.successNicknameNickname', { nickname: nickname ? 'Changed' : 'Reset' }),
                description: t('nickname.userSNicknameHasBeen', { user: user.tag, action: action }),
                fields: [
                    {
                        name: t('nickname.fieldModerator'),
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: t('nickname.infoOldNickname'),
                        value: oldNickname,
                        inline: true
                    },
                    {
                        name: t('nickname.infoNewNickname'),
                        value: newNickname,
                        inline: true
                    },
                    {
                        name: t('nickname.fieldReason'),
                        value: reason,
                        inline: false
                    },
                    {
                        name: t('nickname.fieldUserId'),
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            // Send mod log
            await sendModLog(interaction.guild!, {
                action: 'nickname',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Old Nickname': oldNickname,
                    'New Nickname': newNickname
                }
            });

            // Log the action
            logger.info({ msg: `[MODERATION] User ${user.tag}'s nickname was ${action} by ${interaction.user.tag}. Old: "${oldNickname}", New: "${newNickname}". Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('nickname.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};