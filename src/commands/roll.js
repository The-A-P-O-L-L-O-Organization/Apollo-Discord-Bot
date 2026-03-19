// Dice Command
// Roll dice for random numbers

export default {
    name: 'roll',
    description: 'Roll dice for random numbers',
    category: 'Fun',
    
    dmPermission: true,
    options: [
        {
            name: 'dice',
            description: 'Dice to roll (e.g., 2d6, 1d20)',
            type: 3, // STRING
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            const diceStr = interaction.options.getString('dice') || '1d6';
            
            // Parse dice notation (e.g., "2d6", "1d20")
            const diceMatch = diceStr.toLowerCase().match(/^(\d+)d(\d+)$/);
            
            if (!diceMatch) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Dice',
                        description: 'Please use dice notation (e.g., 2d6, 1d20).',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            const numDice = Math.min(parseInt(diceMatch[1]), 10); // Max 10 dice
            const sides = Math.min(parseInt(diceMatch[2]), 100); // Max 100 sides
            
            const rolls = [];
            for (let i = 0; i < numDice; i++) {
                rolls.push(Math.floor(Math.random() * sides) + 1);
            }
            
            const total = rolls.reduce((sum, roll) => sum + roll, 0);
            const rollsStr = rolls.map((r, i) => {
                const isMax = r === sides;
                const isMin = r === 1;
                if (isMax) return `**${r}** 🎉`; // Critical success
                if (isMin) return `**${r}** 😱`; // Critical fail
                return `**${r}**`;
            }).join(', ');
            
            const diceEmbed = {
                color: sides <= 6 ? 0xFFA500 : sides <= 20 ? 0x3498DB : 0x9B59B6,
                title: '🎲 Dice Roll',
                description: `Rolling **${numDice}d${sides}**...`,
                fields: [
                    {
                        name: '[RESULT] Rolls',
                        value: rollsStr,
                        inline: false
                    },
                    {
                        name: '[TOTAL] Sum',
                        value: `**${total}**`,
                        inline: true
                    },
                    {
                        name: '[INFO] Average',
                        value: `**${(total / numDice).toFixed(1)}**`,
                        inline: true
                    }
                ],
                footer: {
                    text: `Rolled by ${interaction.user.tag}`
                },
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [diceEmbed] });
            
        } catch (error) {
            console.error('[ERROR] Roll command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while rolling dice.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};
