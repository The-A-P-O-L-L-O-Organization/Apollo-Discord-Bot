// Clear Warnings Command
// Clears warnings for a user (single or all)
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getUserData, setUserData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import type { WarningEntry } from './warnings.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'clearwarnings',
    description: 'Clear warnings for a user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to clear warnings for',
            type: 6, // USER type
            required: true
        },
        {
            name: 'warning-id',
            description: 'Specific warning ID to clear (leave empty to clear all)',
            type: 3, // STRING type
            required: false
        },
        {
            name: 'reason',
            description: 'Reason for clearing the warning(s)',
            type: 3, // STRING type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const warningId = interaction.options.getString('warning-id');
            const reason = interaction.options.getString('reason') ?? t('clearwarnings.noReason');

            // Check if user exists
            if (!user) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('clearwarnings.missingUserTitle'),
                        description: t('clearwarnings.missingUserDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Get current warnings
            const warnings = ((await getUserData('warnings', interaction.guild!.id, user.id)) as unknown as WarningEntry[]) ?? [];

            if (warnings.length === 0) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFFFF00,
                        title: t('clearwarnings.infoNoWarnings'),
                        description: t('clearwarnings.userHasNoWarningsTo', { user: user.tag }),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let clearedCount = 0;
            let clearedWarning: WarningEntry | null = null;

            if (warningId) {
                // Clear specific warning by ID
                const warningIndex = warnings.findIndex(w => w.id === warningId);

                if (warningIndex === -1) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('clearwarnings.errorWarningNotFound'),
                            description: `Could not find warning with ID \`${warningId}\` for ${user.tag}.`,
                            fields: [{
                                name: t('clearwarnings.tip'),
                                value: `Use \`/warnings user:${user.tag}\` to see all warning IDs.`
                            }],
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Mark warning as inactive instead of deleting (for history)
                const found = warnings[warningIndex]!;
                clearedWarning = found;
                warnings[warningIndex] = {
                    ...found,
                    active: false,
                    clearedBy: interaction.user.id,
                    clearedByTag: interaction.user.tag,
                    clearedAt: Date.now(),
                    clearReason: reason
                };

                await setUserData('warnings', interaction.guild!.id, user.id, warnings);
                clearedCount = 1;

            } else {
                // Clear all active warnings
                const activeWarnings = warnings.filter(w => w.active !== false);

                if (activeWarnings.length === 0) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFFFF00,
                            title: t('clearwarnings.infoNoActiveWarnings'),
                            description: t('clearwarnings.userHasNoActiveWarnings', { user: user.tag }),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Mark all as inactive
                const updatedWarnings = warnings.map(w => {
                    if (w.active !== false) {
                        return {
                            ...w,
                            active: false,
                            clearedBy: interaction.user.id,
                            clearedByTag: interaction.user.tag,
                            clearedAt: Date.now(),
                            clearReason: reason
                        };
                    }
                    return w;
                });

                await setUserData('warnings', interaction.guild!.id, user.id, updatedWarnings);
                clearedCount = activeWarnings.length;
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(t('clearwarnings.successWarningsCleared'))
                .setDescription(
                    warningId
                        ? `Cleared warning \`${warningId}\` for ${user.tag}.`
                        : `Cleared all ${clearedCount} active warning(s) for ${user.tag}.`
                )
                .addFields(
                    { name: t('clearwarnings.user'), value: t('clearwarnings.userValue', { user: user.tag, value: user.id }), inline: true },
                    { name: t('clearwarnings.clearedBy'), value: interaction.user.tag, inline: true },
                    { name: t('clearwarnings.warningsCleared'), value: t('clearwarnings.count', { count: clearedCount }), inline: true },
                    { name: t('clearwarnings.reason'), value: reason, inline: false }
                )
                .setTimestamp();

            // Add specific warning details if clearing single warning
            if (clearedWarning) {
                embed.addFields({
                    name: t('clearwarnings.clearedWarningDetails'),
                    value: [
                        `**Original Reason:** ${clearedWarning.reason}`,
                        `**Issued By:** ${clearedWarning.moderatorTag ?? 'Unknown'}`,
                        `**Issued:** <t:${Math.floor(clearedWarning.timestamp / 1000)}:R>`
                    ].join('\n'),
                    inline: false
                });
            }

            // Show remaining active warnings
            const remainingActive = (((await getUserData('warnings', interaction.guild!.id, user.id)) as unknown as WarningEntry[]) ?? [])
                .filter(w => w.active !== false).length;

            embed.addFields({
                name: t('clearwarnings.remainingActiveWarnings'),
                value: t('clearwarnings.value', { value: remainingActive }),
                inline: true
            });

            await interaction.reply({ embeds: [embed] });

            // Send mod log
            await sendModLog(interaction.guild!, {
                action: 'clearwarnings',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Warnings Cleared': `${clearedCount}`,
                    'Warning ID': warningId ?? 'All active',
                    'Remaining': `${remainingActive}`
                }
            });

            logger.info({ msg: `[MODERATION] ${clearedCount} warning(s) cleared for ${user.tag} by ${interaction.user.tag}` });

        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] Clear warnings command error' });

            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('clearwarnings.commandFailedTitle'),
                    description: t('clearwarnings.anErrorOccurredWhileClearing'),
                    fields: [{ name: t('clearwarnings.error'), value: (error as Error).message, inline: true }],
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};