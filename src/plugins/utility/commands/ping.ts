import { logger } from '../../../utils/logger.js';

import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'ping',
    description: 'Check the bot\'s latency and response time',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            await interaction.deferReply();

            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');

            const timestamp = interaction.createdTimestamp;
            const now = Date.now();
            const roundTrip = now - timestamp;

            const botPing = Math.round(interaction.client.ws.ping);

            let status;
            if (roundTrip < 100) {
                status = '[EXCELLENT]';
            } else if (roundTrip < 200) {
                status = '[GOOD]';
            } else if (roundTrip < 400) {
                status = '[MODERATE]';
            } else {
                status = '[POOR]';
            }

            const pingEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(t('ping.response'))
                .addFields(
                    {
                        name: t('ping.roundTrip'),
                        value: `${roundTrip}ms`,
                        inline: true
                    },
                    {
                        name: t('ping.apiLatency'),
                        value: `${botPing}ms`,
                        inline: true
                    },
                    {
                        name: t('ping.status'),
                        value: status,
                        inline: true
                    }
                )
                .setFooter({
                    text: t('ping.requestedBy', { user: interaction.user.tag }),
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [pingEmbed] });

            logger.info({ msg: `[SUCCESS] Ping command executed by ${interaction.user.tag}` });
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
