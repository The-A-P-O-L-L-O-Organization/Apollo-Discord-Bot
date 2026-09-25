// 8ball Command
// Ask the magic 8-ball a question
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleDiscordError, safeReply } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: '8ball',
    description: 'Ask the magic 8-ball a question',
    category: 'Fun',

    dmPermission: true,
    options: [
        {
            name: 'question',
            description: 'Your question for the magic 8-ball',
            type: 3, // STRING
            required: true
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const question = interaction.options.getString('question');

            const responses = [
                { text: t('eightball.r0'), color: 0x00FF00 },
                { text: t('eightball.r1'), color: 0x00FF00 },
                { text: t('eightball.r2'), color: 0x00FF00 },
                { text: t('eightball.r3'), color: 0x00FF00 },
                { text: t('eightball.r4'), color: 0x00FF00 },
                { text: t('eightball.r5'), color: 0x00FF00 },
                { text: t('eightball.r6'), color: 0x00FF00 },
                { text: t('eightball.r7'), color: 0x00FF00 },
                { text: t('eightball.r8'), color: 0x00FF00 },
                { text: t('eightball.r9'), color: 0x00FF00 },
                { text: t('eightball.r10'), color: 0xFFA500 },
                { text: t('eightball.r11'), color: 0xFFA500 },
                { text: t('eightball.r12'), color: 0xFFA500 },
                { text: t('eightball.r13'), color: 0xFFA500 },
                { text: t('eightball.r14'), color: 0xFFA500 },
                { text: t('eightball.r15'), color: 0xFF0000 },
                { text: t('eightball.r16'), color: 0xFF0000 },
                { text: t('eightball.r17'), color: 0xFF0000 },
                { text: t('eightball.r18'), color: 0xFF0000 },
                { text: t('eightball.r19'), color: 0xFF0000 }
            ];

            const response = responses[Math.floor(Math.random() * responses.length)];

            if (!response) { return; }

            const ballEmbed = {
                color: response.color,
                title: t('eightball.title'),
                description: `**${t('eightball.question')}:** ${question}\n\n**${t('eightball.answer')}:** ${response.text}`,
                fields: [
                    {
                        name: t('eightball.askedBy'),
                        value: interaction.user.tag,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [ballEmbed] });

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            await safeReply(interaction, errorMessage);
        }
    }
};