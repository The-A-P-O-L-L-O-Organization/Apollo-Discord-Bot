import { config } from '../../../config/config.js';
import { getQueueMetrics } from '../../../queue/metrics.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'queue',
    description: 'Display BullMQ queue statistics and status (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    canQueue: false,
    options: [],

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'admin');
            const denial = await requireOwner(interaction);
            if (denial) {
                return interaction.reply(denial);
            }

            if (!config.queue.enabled) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: t('queue.notEnabledTitle'),
                        description: t('queue.notEnabledDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const metrics = await getQueueMetrics(config.queue);

            const color = metrics.failed > 0 ? 0xFFA500 : metrics.waiting > 0 ? 0x00FF00 : 0x1E90FF;

            return interaction.editReply({
                embeds: [{
                    color,
                    title: t('queue.title', { prefix: config.queue.prefix }),
                    fields: [
                        { name: t('queue.waiting'), value: String(metrics.waiting), inline: true },
                        { name: t('queue.active'), value: String(metrics.active), inline: true },
                        { name: t('queue.failed'), value: String(metrics.failed), inline: true },
                        { name: t('queue.redis'), value: config.queue.redis.host + ':' + config.queue.redis.port, inline: false }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unexpected error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};