// Unlock Command - Unlock a previously locked channel
import type { ChatInputCommandInteraction, TextChannel, PermissionOverwriteOptions} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'unlock',
    description: 'Unlock a previously locked channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        { name: 'channel', description: 'The channel to unlock (defaults to current channel)', type: 7, required: false },
        { name: 'reason', description: 'The reason for unlocking', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel | null;
            const reason = interaction.options.getString('reason') ?? t('unlock.noReason');

            if (!channel!.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unlock.errorInvalidChannel'),
                    description: t('unlock.youCanOnlyUnlockText'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            interface LockInfo { originalPermissions: { SendMessages: boolean | null; AddReactions: boolean | null }; lockedByTag: string; lockedAt: number; reason: string }
            const lockdownData = (await getGuildData('channel-lockdowns', interaction.guild!.id)) as Record<string, LockInfo | undefined>;
            const lockInfo: LockInfo | undefined = lockdownData[channel.id];

            if (!lockInfo) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unlock.errorChannelNotLocked'),
                    description: t('unlock.channelnameIsNotCurrentlyIn', { channelName: channel.name }),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const everyoneRole = interaction.guild!.roles.everyone;

            const restorePermissions: PermissionOverwriteOptions = {};
            if (lockInfo.originalPermissions.SendMessages !== null) {
                restorePermissions.SendMessages = lockInfo.originalPermissions.SendMessages;
            }
            if (lockInfo.originalPermissions.AddReactions !== null) {
                restorePermissions.AddReactions = lockInfo.originalPermissions.AddReactions;
            }

            if (Object.keys(restorePermissions).length === 0) {
                await channel.permissionOverwrites.delete(everyoneRole, `Unlock by ${interaction.user.tag}: ${reason}`);
            } else {
                await channel.permissionOverwrites.edit(everyoneRole, restorePermissions, { reason: `Unlock by ${interaction.user.tag}: ${reason}` });
            }

            delete lockdownData[channel.id];
            await setGuildData('channel-lockdowns', interaction.guild!.id, lockdownData);

            const duration = Date.now() - lockInfo.lockedAt;
            const durationMinutes = Math.floor(duration / 60000);
            const durationText = durationMinutes < 1 ? 'Less than 1 minute' : durationMinutes === 1 ? '1 minute' : `${durationMinutes} minutes`;

            const successEmbed = {
                color: 0x00FF00,
                title: t('unlock.successChannelUnlocked'),
                description: t('unlock.channelnameHasBeenUnlocked', { channelName: channel.name }),
                fields: [
                    { name: t('unlock.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('unlock.infoLockedBy'), value: lockInfo.lockedByTag, inline: true },
                    { name: t('unlock.fieldDuration'), value: durationText, inline: true },
                    { name: t('unlock.infoUnlockReason'), value: reason, inline: false },
                    { name: t('unlock.infoOriginalLockdownReason'), value: lockInfo.reason, inline: false }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            try {
                const unlockNotice = {
                    color: 0x00FF00,
                    title: t('unlock.lockdownLiftedChannelUnlocked'),
                    description: t('unlock.thisChannelHasBeenUnlocked'),
                    fields: [{ name: t('unlock.fieldReason'), value: reason, inline: false }],
                    timestamp: new Date().toISOString()
                };
                await channel.send({ embeds: [unlockNotice] });
            } catch (err) {
                logger.info({ msg: '[WARNING] Could not send unlock notice to channel:', err: (err as Error).message });
            }

            await sendModLog(interaction.guild!, {
                action: 'unlock',
                target: { tag: `#${channel.name}`, id: channel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': `<#${channel.id}>`, 'Duration': durationText }
            });

            logger.info({ msg: `[MODERATION] Channel ${channel.name} was unlocked by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('unlock.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};