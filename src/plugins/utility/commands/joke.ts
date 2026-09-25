import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Joke Command
    // Get a random joke
    name: 'joke',
    description: 'Get a random joke',
    category: 'Fun',
    dmPermission: true,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const jokes = [
                { setup: t('joke.j0s'), punchline: t('joke.j0p') },
                { setup: t('joke.j1s'), punchline: t('joke.j1p') },
                { setup: t('joke.j2s'), punchline: t('joke.j2p') },
                { setup: t('joke.j3s'), punchline: t('joke.j3p') },
                { setup: t('joke.j4s'), punchline: t('joke.j4p') }
            ];

            const randomIndex = Math.floor(Math.random() * jokes.length);
            const joke = jokes[randomIndex];
            if (!joke) { return; }

            const jokeEmbed = {
                color: 0x3498DB,
                title: t('joke.title'),
                description: `**${joke.setup}**\n\n${joke.punchline}`,
                fields: [
                    {
                        name: t('joke.requestedBy'),
                        value: interaction.user.tag,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [jokeEmbed] });

        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] Joke command error' });
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');

            const errorEmbed = {
                color: 0xFF0000,
                title: t('joke.errorTitle'),
                description: t('joke.errorDesc'),
                fields: [
                    {
                        name: t('joke.errorDetails'),
                        value: error instanceof Error ? error.message : 'Unknown error',
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};