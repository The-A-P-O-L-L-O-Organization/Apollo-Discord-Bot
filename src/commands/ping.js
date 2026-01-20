// Ping Command
// Measures bot latency and response time

import { EmbedBuilder } from 'discord.js';

export default {
    name: 'ping',
    description: 'Check the bot\'s latency and response time',
    category: 'Utility',
    
    
    async execute(interaction) {
        // Defer the reply to get accurate latency
        await interaction.deferReply();
        
        // Calculate round-trip time
        const timestamp = interaction.createdTimestamp;
        const now = Date.now();
        const roundTrip = now - timestamp;
        
        // Get bot's API latency
        const botPing = Math.round(interaction.client.ws.ping);
        
        // Determine status
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
        
        // Create embed for the response
        const pingEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Pong!')
            .addFields(
                {
                    name: 'Round-Trip Latency',
                    value: `${roundTrip}ms`,
                    inline: true
                },
                {
                    name: 'API Latency',
                    value: `${botPing}ms`,
                    inline: true
                },
                {
                    name: 'Status',
                    value: status,
                    inline: true
                }
            )
            .setFooter({
                text: `Requested by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();
        
        // Send the embed
        await interaction.editReply({ embeds: [pingEmbed] });
        
        console.log(`[SUCCESS] Ping command executed by ${interaction.user.tag}`);
    }
};

