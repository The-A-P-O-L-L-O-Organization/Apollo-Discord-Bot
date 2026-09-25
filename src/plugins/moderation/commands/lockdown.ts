// Lockdown Command - Lock a channel to prevent @everyone from sending messages
import type { ChatInputCommandInteraction, TextChannel} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'lockdown',
    description: 'Lock a channel to prevent @everyone from sending messages',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        {
            name: 'channel',
            description: 'The channel to lock (defaults to current channel)',
            type: 7, // CHANNEL type
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for the lockdown',
            type: 3, // STRING type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            // Get the channel to lock
            const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel | null;
            const reason = interaction.options.getString('reason') ?? t('lockdown.noReason');

            // Check if the channel is a text-based channel
            if (!channel!.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('lockdown.errorInvalidChannel'),
                    description: t('lockdown.youCanOnlyLockText'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Get the @everyone role
            const everyoneRole = interaction.guild!.roles.everyone;

            // Get current permissions for @everyone in this channel
            const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

            // Check if channel is already locked
            const lockdownData = (await getGuildData('channel-lockdowns', interaction.guild!.id));
            if (lockdownData[channel.id]) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('lockdown.errorChannelAlreadyLocked'),
                    description: t('lockdown.channelidIsAlreadyInLockdown', { channelId: channel.id }),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Store original permissions before locking
            const originalPermissions = currentPermissions ? {
                SendMessages: currentPermissions.allow.has(PermissionsBitField.Flags.SendMessages) ? true :
                    currentPermissions.deny.has(PermissionsBitField.Flags.SendMessages) ? false : null,
                AddReactions: currentPermissions.allow.has(PermissionsBitField.Flags.AddReactions) ? true :
                    currentPermissions.deny.has(PermissionsBitField.Flags.AddReactions) ? false : null
            } : {
                SendMessages: null,
                AddReactions: null
            };

            // Lock the channel
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false,
                AddReactions: false
            }, { reason: `Lockdown by ${interaction.user.tag}: ${reason}` });

            // Save lockdown info to database
            lockdownData[channel.id] = {
                channelId: channel.id,
                originalPermissions: originalPermissions,
                lockedBy: interaction.user.id,
                lockedByTag: interaction.user.tag,
                lockedAt: Date.now(),
                reason: reason
            };
            await setGuildData('channel-lockdowns', interaction.guild!.id, lockdownData);

            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: t('lockdown.successChannelLocked'),
                description: t('lockdown.channelidHasBeenLockedDown', { channelId: channel.id }),
                fields: [
                    {
                        name: t('lockdown.fieldModerator'),
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: t('lockdown.fieldReason'),
                        value: reason,
                        inline: true
                    },
                    {
                        name: t('lockdown.infoChannelId'),
                        value: channel.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            // Send notification to the locked channel
            try {
                const lockNotice = {
                    color: 0xFF0000,
                    title: t('lockdown.lockdownChannelLocked'),
                    description: t('lockdown.thisChannelHasBeenLocked'),
                    fields: [
                        {
                            name: t('lockdown.fieldReason2'),
                            value: reason,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                await channel.send({ embeds: [lockNotice] });
            } catch (err) {
                logger.info({ msg: '[WARNING] Could not send lock notice to channel:', err: (err as Error).message });
            }

            // Send mod log
            await sendModLog(interaction.guild!, {
                action: 'lockdown',
                target: { tag: `#${channel.name}`, id: channel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `<#${channel.id}>`
                }
            });

            // Log the action
            logger.info({ msg: `[MODERATION] Channel ${channel.name} was locked by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('lockdown.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};