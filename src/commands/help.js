// Help Command
// Dynamically displays all available commands with descriptions and usage

import { EmbedBuilder, PermissionsBitField } from 'discord.js';

// Map permission flags to human-readable names
const permissionNames = {
    [PermissionsBitField.Flags.KickMembers]: 'Kick Members',
    [PermissionsBitField.Flags.BanMembers]: 'Ban Members',
    [PermissionsBitField.Flags.MuteMembers]: 'Mute Members',
    [PermissionsBitField.Flags.ManageMessages]: 'Manage Messages',
    [PermissionsBitField.Flags.Administrator]: 'Administrator',
    [PermissionsBitField.Flags.ModerateMembers]: 'Moderate Members',
};

/**
 * Converts command options to a usage string
 * @param {Array} options - Command options array
 * @returns {string} Usage string
 */
function getUsageString(commandName, options = []) {
    if (!options.length) return `/${commandName}`;
    
    const optionStrings = options.map(opt => {
        return opt.required ? `<${opt.name}>` : `[${opt.name}]`;
    });
    
    return `/${commandName} ${optionStrings.join(' ')}`;
}

/**
 * Gets permission name from flags
 * @param {bigint} permissions - Permission flags
 * @returns {string|null} Permission name or null
 */
function getPermissionName(permissions) {
    if (!permissions) return null;
    return permissionNames[permissions] || 'Special Permission';
}

export default {
    name: 'help',
    description: 'Shows all available commands with descriptions and usage',
    category: 'Utility',
    
    async execute(interaction) {
        // Get all commands from the client
        const commands = interaction.client.commands;
        
        // Group commands by category
        const categories = {};
        
        for (const [name, cmd] of commands) {
            const category = cmd.category || 'Uncategorized';
            
            if (!categories[category]) {
                categories[category] = [];
            }
            
            categories[category].push({
                name: cmd.name,
                description: cmd.description,
                usage: getUsageString(cmd.name, cmd.options),
                permissions: getPermissionName(cmd.defaultMemberPermissions)
            });
        }
        
        // Sort categories (Utility first, then alphabetically)
        const sortedCategories = Object.entries(categories).sort(([a], [b]) => {
            if (a === 'Utility') return -1;
            if (b === 'Utility') return 1;
            return a.localeCompare(b);
        });
        
        // Count total commands
        const totalCommands = commands.size;
        
        // Create help embed
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('Bot Help Menu')
            .setDescription(
                'Here are all the available commands you can use:\n\n' +
                'Use `/` before each command\n\n' +
                '----------------------------------------'
            )
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true }))
            .setFooter({
                text: `Requested by ${interaction.user.tag} | Total Commands: ${totalCommands}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();
        
        // Add fields for each category
        for (const [category, cmds] of sortedCategories) {
            const commandList = cmds.map(cmd => {
                let line = `\`${cmd.usage}\`\n   └─ ${cmd.description}`;
                if (cmd.permissions) {
                    line += `\n   └─ Requires: \`${cmd.permissions}\``;
                }
                return line;
            }).join('\n\n');
            
            helpEmbed.addFields({
                name: `[CATEGORY] ${category} (${cmds.length})`,
                value: commandList,
                inline: false
            });
        }
        
        // Add usage guide
        helpEmbed.addFields({
            name: 'How to Use Commands',
            value: '1. Type `/` in the chat\n' +
                   '2. Select the bot from the list\n' +
                   '3. Choose a command\n' +
                   '4. Fill in any required parameters\n' +
                   '5. Press Enter to execute',
            inline: false
        });
        
        // Add legend
        helpEmbed.addFields({
            name: 'Legend',
            value: '`<param>` = Required parameter\n' +
                   '`[param]` = Optional parameter',
            inline: false
        });
        
        // Send the help embed
        await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
        
        console.log(`[SUCCESS] Help command executed by ${interaction.user.tag}`);
    }
};
