// Strike Command - Issue a strike to a user (more severe than warnings)
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getUserData, appendToUserArray, generateId, getGuildData } from '../../../utils/db.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { i18n } from '../../../i18n/index.js';

export interface StrikeEntry {
    id: string;
    reason: string;
    moderatorId: string;
    moderatorTag: string;
    timestamp: number;
    active?: boolean;
}

interface StrikeConfig {
    banThreshold?: number;
    autoKick?: boolean;
    kickThreshold?: number;
    [key: string]: unknown;
}

export default {
    name: 'strike',
    description: 'Issue a strike to a user (more severe than warnings)',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to strike',
            type: 6,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for the strike',
            type: 3,
            required: true
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason', true);

            if (!user) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('strike.missingUserTitle'),
                        description: t('strike.missingUserDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (user.bot) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('strike.errorInvalidTarget'),
                        description: t('strike.botProtectionDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (user.id === interaction.user.id) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('strike.selfActionTitle'),
                        description: t('strike.selfActionDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('strike.memberNotFoundTitle'),
                        description: t('strike.memberNotFoundDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('strike.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const strike = {
                id: generateId(),
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                timestamp: Date.now(),
                active: true
            };

            await appendToUserArray('strikes', interaction.guild!.id, user.id, strike);

            const userStrikes = ((await getUserData('strikes', interaction.guild!.id, user.id)) as unknown as StrikeEntry[]) ?? [];
            const activeStrikes = userStrikes.filter(s => s.active !== false);
            const strikeCount = activeStrikes.length;

            const guildSettings = (await getGuildData('strike-config', interaction.guild!.id)) as StrikeConfig;
            const threshold = guildSettings.banThreshold ?? 3;
            const autoKick = guildSettings.autoKick ?? true;
            const kickThreshold = guildSettings.kickThreshold ?? 2;

            let dmSent = false;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(t('strike.strikeIssuedInServer', { server: interaction.guild!.name }))
                    .setDescription(t('strike.youHaveBeenIssuedA'))
                    .addFields(
                        { name: t('strike.reason'), value: reason, inline: false },
                        { name: t('strike.totalStrikes'), value: t('strike.countThreshold', { count: strikeCount, threshold: threshold }), inline: true },
                        { name: t('strike.strikeId'), value: strike.id, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: t('strike.countStrikeSRemainingBefore', { count: threshold - strikeCount }) });

                await user.send({ embeds: [dmEmbed] });
                dmSent = true;
            } catch {
                logger.info({ msg: `[INFO] Could not DM user ${user.tag} about strike` });
            }

            let autoPunishment: string | null = null;

            if (strikeCount >= threshold) {
                try {
                    await interaction.guild!.bans.create(user.id, {
                        reason: `Auto-ban: Reached ${strikeCount} strikes. Latest: ${reason}`
                    });
                    autoPunishment = 'banned';
                } catch (banError) {
                    logger.error({ err: banError, msg: '[ERROR] Auto-ban failed' });
                }
            } else if (autoKick && strikeCount >= kickThreshold) {
                try {
                    if (member.kickable) {
                        await member.kick(`Auto-kick: Reached ${strikeCount} strikes. Latest: ${reason}`);
                        autoPunishment = 'kicked';
                    }
                } catch (kickError) {
                    logger.error({ err: kickError, msg: '[ERROR] Auto-kick failed' });
                }
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(t('strike.successStrikeIssued'))
                .setDescription(t('strike.userHasBeenIssuedA', { user: user.tag }))
                .addFields(
                    { name: t('strike.user'), value: t('strike.userValue', { user: user.tag, value: user.id }), inline: true },
                    { name: t('strike.moderator'), value: interaction.user.tag, inline: true },
                    { name: t('strike.reason2'), value: reason, inline: false },
                    { name: t('strike.totalStrikes2'), value: t('strike.countThreshold2', { count: strikeCount, threshold: threshold }), inline: true },
                    { name: t('strike.strikeId2'), value: strike.id, inline: true },
                    { name: t('strike.dmSent'), value: dmSent ? 'Yes' : 'No', inline: true }
                )
                .setTimestamp();

            if (autoPunishment) {
                successEmbed.addFields({
                    name: t('strike.autoPunishmentApplied'),
                    value: t('strike.userHasBeenValueFor', { value: autoPunishment, count: strikeCount }),
                    inline: false
                });
            } else {
                successEmbed.addFields({
                    name: t('strike.remaining'),
                    value: t('strike.countStrikeSUntilBan', { count: threshold - strikeCount }),
                    inline: false
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'strike',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Strike Count': `${strikeCount}/${threshold}`,
                    'Strike ID': strike.id,
                    'Auto-Punishment': autoPunishment ?? 'None'
                }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} struck by ${interaction.user.tag}. Total: ${strikeCount}. Reason: ${reason}` });

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: t('strike.commandFailedTitle'),
                description: t('strike.anErrorOccurredWhileIssuing'),
                fields: [{ name: t('strike.error'), value: safeError(error), inline: true }],
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