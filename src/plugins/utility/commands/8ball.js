// 8ball Command
// Ask the magic 8-ball a question

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
    
    async execute(interaction) {
        try {
            const question = interaction.options.getString('question');
            
            const responses = [
                { text: 'It is certain.', color: 0x00FF00 },
                { text: 'It is decidedly so.', color: 0x00FF00 },
                { text: 'Without a doubt.', color: 0x00FF00 },
                { text: 'Yes definitely.', color: 0x00FF00 },
                { text: 'You may rely on it.', color: 0x00FF00 },
                { text: 'As I see it, yes.', color: 0x00FF00 },
                { text: 'Most likely.', color: 0x00FF00 },
                { text: 'Outlook good.', color: 0x00FF00 },
                { text: 'Yes.', color: 0x00FF00 },
                { text: 'Signs point to yes.', color: 0x00FF00 },
                { text: 'Reply hazy, try again.', color: 0xFFA500 },
                { text: 'Ask again later.', color: 0xFFA500 },
                { text: 'Better not tell you now.', color: 0xFFA500 },
                { text: 'Cannot predict now.', color: 0xFFA500 },
                { text: 'Concentrate and ask again.', color: 0xFFA500 },
                { text: 'Don\'t count on it.', color: 0xFF0000 },
                { text: 'My reply is no.', color: 0xFF0000 },
                { text: 'My sources say no.', color: 0xFF0000 },
                { text: 'Outlook not so good.', color: 0xFF0000 },
                { text: 'Very doubtful.', color: 0xFF0000 }
            ];
            
            const response = responses[Math.floor(Math.random() * responses.length)];
            
            const ballEmbed = {
                color: response.color,
                title: '🎱 Magic 8-Ball',
                description: `**Question:** ${question}\n\n**Answer:** ${response.text}`,
                fields: [
                    {
                        name: '[INFO] Asked by',
                        value: interaction.user.tag,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [ballEmbed] });
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred.',
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
