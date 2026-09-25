import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Roll Command
    // Roll dice for random numbers
    name: 'roll',
    description: 'Roll dice for random numbers',
    category: 'Fun',
    dmPermission: true,
    options: [
        { name: 'dice', description: 'Dice to roll (e.g., 2d6, 1d20)', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const diceStr = interaction.options.getString('dice') ?? '1d6';

            if (diceStr.length > 10) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('roll.invalidTitle'),
                        description: t('roll.tooLong'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const diceMatch = /^(\d+)d(\d+)$/.exec(diceStr.toLowerCase());

            if (!diceMatch) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('roll.invalidTitle'),
                        description: t('roll.invalidFormat'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const numDice = Math.min(parseInt(diceMatch[1] ?? '1', 10), 10);
            const sides = Math.min(parseInt(diceMatch[2] ?? '6', 10), 100);

            if (numDice < 1) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('roll.invalidTitle'),
                        description: t('roll.minDice'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (sides < 2) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('roll.invalidTitle'),
                        description: t('roll.minSides'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const rolls = [];
            for (let _i = 0; _i < numDice; _i++) {
                rolls.push(Math.floor(Math.random() * sides) + 1);
            }

            const total = rolls.reduce((sum, roll) => sum + roll, 0);
            const rollsStr = rolls.map((r, _i) => {
                const isMax = r === sides;
                const isMin = r === 1;
                if (isMax) {
                    return `**${r}** [SUCCESS]`;
                }
                if (isMin) {
                    return `**${r}** 😱`;
                }
                return `**${r}**`;
            }).join(', ');

            const diceEmbed = new EmbedBuilder()
                .setColor(sides <= 6 ? 0xFFA500 : sides <= 20 ? 0x3498DB : 0x9B59B6)
                .setTitle(t('roll.title'))
                .setDescription(t('roll.rolling', { spec: `${numDice}d${sides}` }))
                .addFields(
                    { name: t('roll.rolls'), value: rollsStr, inline: false },
                    { name: t('roll.total'), value: `**${total}**`, inline: true },
                    { name: t('roll.average'), value: `**${(total / numDice).toFixed(1)}**`, inline: true }
                )
                .setFooter({ text: t('roll.rolledBy', { user: interaction.user.tag }) })
                .setTimestamp();

            await interaction.reply({ embeds: [diceEmbed] });
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