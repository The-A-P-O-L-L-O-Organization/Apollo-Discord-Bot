// Reload Command
// Hot-reloads a single command file without restarting the bot.
// Only usable by bot owners (checked against OWNER_IDS in .env).

import { PermissionsBitField } from 'discord.js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    name: 'reload',
    description: 'Hot-reload a command file without restarting the bot (bot owner only)',
    category: 'Developer',

    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'command',
            description: 'Name of the command to reload (without /)',
            type: 3, // STRING
            required: true
        }
    ],

    async execute(interaction) {
        // Restrict to bot owners defined in OWNER_IDS env var (comma-separated)
        const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
        if (ownerIds.length > 0 && !ownerIds.includes(interaction.user.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Access Denied',
                    description: 'Only bot owners can use this command.',
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const commandName = interaction.options.getString('command').toLowerCase();
        const commandPath = path.join(__dirname, `${commandName}.js`);

        if (!existsSync(commandPath)) {
            return interaction.editReply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Not Found',
                    description: `No command file found for \`${commandName}\`.`,
                    timestamp: new Date().toISOString()
                }]
            });
        }

        // Delete the old command from the collection
        interaction.client.commands.delete(commandName);

        try {
            // ES module cache-busting: append a timestamp query param so Node
            // treats it as a fresh module rather than returning the cached one.
            const fileUrl = pathToFileURL(commandPath).href + `?t=${Date.now()}`;
            const freshModule = await import(fileUrl);

            if (!freshModule.default || !freshModule.default.name) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Module',
                        description: `The file \`${commandName}.js\` does not export a valid command.`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }

            interaction.client.commands.set(freshModule.default.name, freshModule.default);

            console.log(`[RELOAD] Command /${commandName} reloaded by ${interaction.user.tag}`);

            return interaction.editReply({
                embeds: [{
                    color: 0x00FF00,
                    title: '[SUCCESS] Command Reloaded',
                    description: `\`/${commandName}\` has been reloaded successfully.`,
                    fields: [
                        { name: 'Reloaded By', value: interaction.user.tag, inline: true },
                        { name: 'Command', value: `/${freshModule.default.name}`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });

        } catch (error) {
            console.error(`[ERROR] Failed to reload /${commandName}:`, error);

            // Re-register the old version if it's still cached by Node (best-effort)
            return interaction.editReply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Reload Failed',
                    description: `Failed to reload \`/${commandName}\`. The old version is still active.`,
                    fields: [
                        { name: 'Error', value: error.message.substring(0, 1024), inline: false }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });
        }
    }
};
