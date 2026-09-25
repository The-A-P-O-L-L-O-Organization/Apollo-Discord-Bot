import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { calculateSLAMetrics, formatTime, DEFAULT_SLA_THRESHOLDS } from '../../../utils/slaTracker.js';
import { getGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface SLAThresholds {
    urgent: number;
    high: number;
    medium: number;
    low: number;
}

interface TicketConfig {
    slaThresholds?: SLAThresholds;
}

export default {
    data: new SlashCommandBuilder()
        .setName('sla')
        .setDescription('View SLA metrics and response time statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    name: 'sla',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const guildId = interaction.guild!.id;
            const metrics = await calculateSLAMetrics(guildId);
            const ticketConfig = await getGuildData('tickets', guildId) as TicketConfig | null;
            const slaThresholds = ticketConfig?.slaThresholds ?? DEFAULT_SLA_THRESHOLDS;

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(t('sla.title'))
                .setDescription(t('sla.desc'))
                .setTimestamp();

            const slaComplianceRate = metrics.totalTickets > 0
                ? ((metrics.slaMet / metrics.totalTickets) * 100).toFixed(1)
                : 'N/A';

            embed.addFields({
                name: t('sla.overall'),
                value: [
                    t('sla.totalClosed', { count: metrics.totalTickets }),
                    t('sla.avgResponse', { time: formatTime(metrics.avgResponseTime) }),
                    t('sla.avgResolution', { time: formatTime(metrics.avgResolutionTime) }),
                    t('sla.compliance', { rate: slaComplianceRate }),
                    t('sla.metBreached', { met: metrics.slaMet, breached: metrics.slaBreached })
                ].join('\n'),
                inline: false
            });

            if (metrics.openTicketsBreached > 0) {
                embed.addFields({
                    name: t('sla.breachedTitle'),
                    value: t('sla.breachedValue', { count: metrics.openTicketsBreached }),
                    inline: false
                });
            }

            embed.addFields({
                name: t('sla.thresholds'),
                value: [
                    t('sla.urgent', { time: formatTime(slaThresholds.urgent) }),
                    t('sla.high', { time: formatTime(slaThresholds.high) }),
                    t('sla.medium', { time: formatTime(slaThresholds.medium) }),
                    t('sla.low', { time: formatTime(slaThresholds.low) })
                ].join('\n'),
                inline: true
            });

            if (Object.keys(metrics.byPriority).length > 0) {
                const priorityStats = Object.entries(metrics.byPriority)
                    .map(([priority, data]) => {
                        return t('sla.priorityRow', { priority: priority.charAt(0).toUpperCase() + priority.slice(1), count: data.count, time: formatTime(data.avgResponseTime) });
                    })
                    .join('\n');

                embed.addFields({
                    name: t('sla.byPriority'),
                    value: priorityStats || t('sla.noData'),
                    inline: false
                });
            }

            if (Object.keys(metrics.byCategory).length > 0) {
                const categoryStats = Object.entries(metrics.byCategory)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 5)
                    .map(([category, data]) => {
                        return t('sla.categoryRow', { category: category.charAt(0).toUpperCase() + category.slice(1), count: data.count, time: formatTime(data.avgResponseTime) });
                    })
                    .join('\n');

                embed.addFields({
                    name: t('sla.byCategory'),
                    value: categoryStats || t('sla.noData'),
                    inline: false
                });
            }

            if (metrics.openTicketsBreached > 0) {
                embed.addFields({
                    name: t('sla.recommendations'),
                    value: t('sla.recommendationsValue'),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
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