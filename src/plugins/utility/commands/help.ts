// Help Command
// Dynamically displays all available commands with descriptions and usage
import { logger } from '../../../utils/logger.js';

import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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
function getUsageString(commandName: string, options: { name: string; required?: boolean }[] = []): string {
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
    return permissionNames[String(permissions)] ?? 'Special Permission';
}

export default {
    name: 'help',
    description: 'Shows all available commands with descriptions and usage',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolvedLocale = await i18n.resolveLocale({
            locale: interaction.locale ?? null,
            guildLocale: interaction.guildLocale ?? null,
            guildId: interaction.guildId ?? null
        });
        const t = i18n.getFixedT(resolvedLocale, 'utility');
        try {
            // Get all commands from the client
            // @ts-expect-error commands Map added by plugin system
            const commands = interaction.client.commands as Map<string, { name: string; description: string; category?: string; options: { name: string; required?: boolean }[]; defaultMemberPermissions?: bigint | number | string }>;

            // Group commands by category
            const categories: Record<string, { name: string; description: string; usage: string; permissions: string | null }[]> = {};

            for (const [, cmd] of commands) {
                const category = cmd.category ?? 'Uncategorized';

                categories[category] ??= [];

                categories[category].push({
                    name: cmd.name,
                    description: cmd.description,
                    usage: getUsageString(cmd.name, cmd.options),
                    permissions: getPermissionName(cmd.defaultMemberPermissions)
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
                .setTitle(t('help.title'))
                .setDescription(t('help.description'))
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({
                    text: t('help.footer', { tag: interaction.user.tag, count: totalCommands }),
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            // Add fields for each category
            for (const [category, cmds] of sortedCategories) {
                const commandList = cmds.map(cmd => {
                    let line = `\`${cmd.usage}\`\n   └─ ${cmd.description}`;
                    if (cmd.permissions) {
                        line += `\n   └─ ${t('help.requires', { perms: cmd.permissions })}`;
                    }
                    return line;
                }).join('\n\n');

                helpEmbed.addFields({
                    name: t('help.category', { category, count: cmds.length }),
                    value: commandList,
                    inline: false
                });
            }

            // Add usage guide
            helpEmbed.addFields({
                name: t('help.howTo'),
                value: t('help.howToValue'),
                inline: false
            });

            // Add legend
            helpEmbed.addFields({
                name: t('help.legend'),
                value: t('help.legendValue'),
                inline: false
            });

            // Send the help embed
            await interaction.reply({ embeds: [helpEmbed], ephemeral: false });

            logger.info({ msg: `[SUCCESS] Help command executed by ${interaction.user.tag}` });

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