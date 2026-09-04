// Help Command
// Dynamically displays all available commands with descriptions and usage
import { logger } from '../../../utils/logger.js';

import { ChatInputCommandInteraction, EmbedBuilder, PermissionsBitField } from 'discord.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

// Map permission flags to human-readable names
const permissionNames: Record<string, string> = {
    [String(PermissionsBitField.Flags.KickMembers)]: 'Kick Members',
    [String(PermissionsBitField.Flags.BanMembers)]: 'Ban Members',
    [String(PermissionsBitField.Flags.MuteMembers)]: 'Mute Members',
    [String(PermissionsBitField.Flags.ManageMessages)]: 'Manage Messages',
    [String(PermissionsBitField.Flags.Administrator)]: 'Administrator',
    [String(PermissionsBitField.Flags.ModerateMembers)]: 'Moderate Members'
};

/**
 * Converts command options to a usage string
 * @param commandName - Command name
 * @param options - Command options array
 * @returns Usage string
 */
function getUsageString(commandName: string, options: Array<{ name: string; required?: boolean }> = []): string {
    if (!options.length) { return `/${commandName}`; }

    const optionStrings = options.map(opt => {
        return opt.required ? `<${opt.name}>` : `[${opt.name}]`;
    });

    return `/${commandName} ${optionStrings.join(' ')}`;
}

/**
 * Gets permission name from flags
 * @param permissions - Permission flags
 * @returns Permission name or null
 */
function getPermissionName(permissions: bigint | number | string | null | undefined): string | null {
    if (!permissions) { return null; }
    return permissionNames[String(permissions)] || 'Special Permission';
}

export default {
    name: 'help',
    description: 'Shows all available commands with descriptions and usage',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            // Get all commands from the client
            // @ts-expect-error commands Map added by plugin system
            const commands = interaction.client.commands as Map<string, { name: string; description: string; category?: string; options: Array<{ name: string; required?: boolean }>; defaultMemberPermissions?: bigint | number | string }>;

            // Group commands by category
            const categories: Record<string, Array<{ name: string; description: string; usage: string; permissions: string | null }>> = {};

            for (const [, cmd] of commands) {
                const category = cmd.category || 'Uncategorized';

                if (!categories[category]) {
                    categories[category] = [];
                }

                categories[category].push({
                    name: cmd.name,
                    description: cmd.description,
                    usage: getUsageString(cmd.name, cmd.options as Array<{ name: string; required?: boolean }>),
                    permissions: getPermissionName(cmd.defaultMemberPermissions as bigint | null)
                });
            }

            // Sort categories (Utility first, then alphabetically)
            const sortedCategories = Object.entries(categories).sort(([a], [b]) => {
                if (a === 'Utility') { return -1; }
                if (b === 'Utility') { return 1; }
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
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({
                    text: `Requested by ${interaction.user.tag} | Total Commands: ${totalCommands}`,
                    iconURL: interaction.user.displayAvatarURL()
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

            logger.info({ msg: `[SUCCESS] Help command executed by ${interaction.user.tag}` });

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