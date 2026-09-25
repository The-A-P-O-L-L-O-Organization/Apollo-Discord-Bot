// Clear Strikes Command - Remove strikes from a user
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getUserData, setUserData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import type { StrikeEntry } from './strike.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Remove strikes from a user
    name: 'clearstrikes',
    description: 'Remove strikes from a user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to clear strikes from',
            type: 6, // USER type
            required: true
        },
        {
            name: 'strike_id',
            description: 'Specific strike ID to remove (leave empty to remove all)',
            type: 3, // STRING type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const strikeId = interaction.options.getString('strike_id');

            if (!user) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('clearstrikes.missingUserTitle'),
                        description: t('clearstrikes.missingUserDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Get user's strikes
            const strikes = ((await getUserData('strikes', interaction.guild!.id, user.id)) as unknown as StrikeEntry[]) ?? [];

            if (strikes.length === 0) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('clearstrikes.errorNoStrikes'),
                        description: t('clearstrikes.userHasNoStrikesTo', { user: user.tag }),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let removed = 0;
            let description = '';

            if (strikeId) {
                // Remove specific strike
                const strikeIndex = strikes.findIndex(s => s.id === strikeId);

                if (strikeIndex === -1) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('clearstrikes.errorStrikeNotFound'),
                            description: t('clearstrikes.strikeWithIdStrikeidNot', { strikeId: strikeId }),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                strikes[strikeIndex]!.active = false;
                removed = 1;
                description = `Strike ${strikeId} has been removed.`;

                // Update strikes
                await setUserData('strikes', interaction.guild!.id, user.id, strikes);

            } else {
                // Clear all strikes
                const activeCount = strikes.filter(s => s.active !== false).length;

                // Mark all as inactive
                strikes.forEach(s => s.active = false);
                removed = activeCount;
                description = `All ${removed} strike(s) have been removed.`;

                // Update strikes
                await setUserData('strikes', interaction.guild!.id, user.id, strikes);
            }

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(t('clearstrikes.successStrikesCleared'))
                .setDescription(description)
                .addFields(
                    { name: t('clearstrikes.user'), value: t('clearstrikes.userValue', { user: user.tag, value: user.id }), inline: true },
                    { name: t('clearstrikes.moderator'), value: interaction.user.tag, inline: true },
                    { name: t('clearstrikes.strikesRemoved'), value: t('clearstrikes.count', { count: removed }), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed] });

            // Send mod log
            await sendModLog(interaction.guild!, {
                action: 'clearstrikes',
                target: user,
                moderator: interaction.user,
                reason: strikeId ? `Strike ${strikeId} removed` : 'All strikes removed',
                extra: {
                    'Strikes Removed': `${removed}`
                }
            });

            logger.info({ msg: `[MODERATION] ${removed} strike(s) cleared for ${user.tag} by ${interaction.user.tag}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('clearstrikes.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};