import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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
            const diceStr = interaction.options.getString('dice') || '1d6';

            if (diceStr.length > 10) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Dice',
                        description: 'Dice notation is too long. Please use format like "2d6" or "1d20".',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const diceMatch = diceStr.toLowerCase().match(/^(\d+)d(\d+)$/);

            if (!diceMatch) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Dice',
                        description: 'Please use dice notation (e.g., 2d6, 1d20). Maximum 10 dice with up to 100 sides each.',
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
                        title: '[ERROR] Invalid Dice',
                        description: 'You must roll at least 1 die.',
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
                        title: '[ERROR] Invalid Dice',
                        description: 'Dice must have at least 2 sides.',
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
                .setTitle('[DICE] Dice Roll')
                .setDescription(`Rolling **${numDice}d${sides}**...`)
                .addFields(
                    { name: 'Result Rolls', value: rollsStr, inline: false },
                    { name: 'Total Sum', value: `**${total}**`, inline: true },
                    { name: 'Average', value: `**${(total / numDice).toFixed(1)}**`, inline: true }
                )
                .setFooter({ text: `Rolled by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ embeds: [diceEmbed] });
        } catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};