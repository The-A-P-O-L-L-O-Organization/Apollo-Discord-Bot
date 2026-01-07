// Help Command
// Displays all available commands with descriptions and usage

import { EmbedBuilder, ApplicationCommandType } from 'discord.js';
import { config } from '../config/config.js';

// Command definitions with descriptions and usage
const commands = [
    {
        name: 'ping',
        description: 'Check the bot\'s latency and response time',
        category: 'Utility',
        usage: '/ping'
    },
    {
        name: 'help',
        description: 'Shows this help message with all available commands',
        category: 'Utility',
        usage: '/help'
    },
    {
        name: 'userinfo',
        description: 'Displays information about a user',
        category: 'Utility',
        usage: '/userinfo [user]'
    }
];

export default {
    name: 'help',
    description: 'Shows this help message with all available commands',
    type: ApplicationCommandType.ChatInput,
    
    async execute(interaction) {
        // Group commands by category
        const categories = {};
        
        for (const cmd of commands) {
            if (!categories[cmd.category]) {
                categories[cmd.category] = [];
            }
            categories[cmd.category].push(cmd);
        }
        
        // Create help embed
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('Bot Help Menu')
            .setDescription('Here are all the available commands you can use:\n\n' +
                `Prefix: ${config.prefix}\n` +
                'Use `/` before each command\n\n' +
                '----------------------------------------')
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true }))
            .setFooter({
                text: `Requested by ${interaction.user.tag} | Total Commands: ${commands.length}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();
        
        // Add fields for each category
        for (const [category, cmds] of Object.entries(categories)) {
            const commandList = cmds.map(cmd => {
                return `\`/${cmd.name}\` - ${cmd.description}`;
            }).join('\n');
            
            helpEmbed.addFields({
                name: `[CATEGORY] ${category}`,
                value: commandList,
                inline: false
            });
        }
        
        // Add usage guide
        helpEmbed.addFields({
            name: 'How to Use Commands',
            value: '1. Type `/` in the chat\n' +
                   '2. Select the bot (John)\n' +
                   '3. Choose a command from the list\n' +
                   '4. Press Enter to execute',
            inline: false
        });
        
        // Send the help embed
        await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
        
        console.log(`[SUCCESS] Help command executed by ${interaction.user.tag}`);
    }
};

