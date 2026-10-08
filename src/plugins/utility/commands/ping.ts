import { logger } from '../../../utils/logger.js';

import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
import { ok, err, tryCatch } from '../../../utils/result.js';
import type { Result } from '../../../utils/result.js';

interface PingData {
    roundTrip: number;
    apiLatency: number;
    status: string;
    locale: string;
}

async function buildPingData(interaction: ChatInputCommandInteraction): Promise<Result<PingData, Error>> {
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

    let status: string;
    if (roundTrip < 100) {
        status = '[EXCELLENT]';
    } else if (roundTrip < 200) {
        status = '[GOOD]';
    } else if (roundTrip < 400) {
        status = '[MODERATE]';
    } else {
        status = '[POOR]';
    }

    return ok({ roundTrip, apiLatency: botPing, status, locale: resolvedLocale });
}

function createPingEmbed(data: PingData, userTag: string, userAvatar: string): EmbedBuilder {
    const t = i18n.getFixedT(data.locale, 'utility');

    return new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('ping.response'))
        .addFields(
            {
                name: t('ping.roundTrip'),
                value: `${data.roundTrip}ms`,
                inline: true
            },
            {
                name: t('ping.apiLatency'),
                value: `${data.apiLatency}ms`,
                inline: true
            },
            {
                name: t('ping.status'),
                value: data.status,
                inline: true
            }
        )
        .setFooter({
            text: t('ping.requestedBy', { user: userTag }),
            iconURL: userAvatar
        })
        .setTimestamp();
}

export default {
    name: 'ping',
    description: 'Check the bot\'s latency and response time',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const result = await tryCatch(async () => {
            await interaction.deferReply();

            const pingDataResult = await buildPingData(interaction);

            if (!pingDataResult.ok) {
                throw pingDataResult.error;
            }

            const embed = createPingEmbed(pingDataResult.value, interaction.user.tag, interaction.user.displayAvatarURL());

            await interaction.editReply({ embeds: [embed] });

            logger.info({ msg: `[SUCCESS] Ping command executed by ${interaction.user.tag}` });
        });

        if (!result.ok) {
            const errorMessage = handleDiscordError(result.error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};
