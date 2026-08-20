// Deploy Commands Script
// Registers slash commands with Discord for immediate use in a specific guild

import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import { config } from '../src/config/config.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Exit codes
const EXIT_CODES = {
    SUCCESS: 0,
    CONFIG_ERROR: 1,
    VALIDATION_ERROR: 2,
    DEPLOYMENT_ERROR: 3
};

// CLI argument parsing
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        guild: null,
        global: false,
        dryRun: false,
        clear: false,
        json: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
        case '--guild':
            options.guild = args[++i];
            break;
        case '--global':
            options.global = true;
            break;
        case '--dry-run':
            options.dryRun = true;
            break;
        case '--clear':
            options.clear = true;
            break;
        case '--json':
            options.json = true;
            break;
        case '--help':
        case '-h':
            options.help = true;
            break;
        default:
            console.error(`[ERROR] Unknown argument: ${arg}`);
            process.exit(EXIT_CODES.CONFIG_ERROR);
        }
    }

    return options;
}

function printHelp() {
    console.log('Discord Bot - Command Deployment');
    console.log('===================================\n');
    console.log('Usage: node scripts/deploy-commands.js [options]\n');
    console.log('Options:');
    console.log('  --guild <id>     Deploy to specific guild (overrides GUILD_ID env)');
    console.log('  --global         Force global deployment (ignores GUILD_ID)');
    console.log('  --dry-run        Print commands without deploying');
    console.log('  --clear          Delete all commands (guild or global)');
    console.log('  --json           Output JSON array of deployed commands');
    console.log('  --help, -h       Show this help message');
    console.log('\nEnvironment variables:');
    console.log('  DISCORD_TOKEN    Bot token (required)');
    console.log('  CLIENT_ID        Application ID (required)');
    console.log('  GUILD_ID         Guild ID for development deployment (optional)');
    console.log('\nExit codes:');
    console.log('  0  Success');
    console.log('  1  Configuration error');
    console.log('  2  Validation error');
    console.log('  3  Deployment error');
}

// Command validation
function validateCommands(commands) {
    const warnings = [];
    const seenNames = new Set();

    for (const cmd of commands) {
        // Check for missing description
        if (!cmd.description || cmd.description.trim() === '') {
            warnings.push(`Command "/${cmd.name}" has no description`);
        }

        // Check for duplicate names
        if (seenNames.has(cmd.name)) {
            warnings.push(`Duplicate command name: "${cmd.name}"`);
        }
        seenNames.add(cmd.name);

        // Validate option types if present
        if (cmd.options) {
            for (const opt of cmd.options) {
                if (opt.type !== undefined && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(opt.type)) {
                    warnings.push(`Command "/${cmd.name}" option "${opt.name}" has invalid type: ${opt.type}`);
                }
            }
        }
    }

    return warnings;
}

// Load commands from plugins
async function loadCommands() {
    const commands = [];
    const pluginsDir = join(__dirname, '..', 'src', 'plugins');

    try {
        const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

        for (const plugin of pluginDirs) {
            const commandsPath = join(pluginsDir, plugin, 'commands');
            try {
                const commandFiles = readdirSync(commandsPath).filter(
                    file => file.endsWith('.js')
                );

                for (const file of commandFiles) {
                    const filePath = join(commandsPath, file);
                    const command = await import(`file://${filePath}`);

                    if (command.default) {
                        let commandData;
                        if (command.default.data) {
                            commandData = command.default.data.toJSON();
                        } else if (command.default.name) {
                            const isContextMenu = command.default.type === 2 || command.default.type === 3;
                            commandData = {
                                name: command.default.name,
                                description: isContextMenu ? undefined : (command.default.description || 'No description'),
                                type: command.default.type || 1,
                                options: command.default.options || []
                            };
                        } else {
                            continue;
                        }
                        commands.push(commandData);
                    }
                }
            } catch {
                // No commands directory for this plugin, skip
            }
        }

    } catch (error) {
        console.error('[ERROR] Error loading commands:', error);
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    return commands;
}

// Deploy or clear commands
async function deployCommands(commands, options) {
    // Check if token is set
    if (config.DISCORD_TOKEN === 'your-token-here' || !config.DISCORD_TOKEN) {
        console.error('[ERROR] Please set your Discord bot token in .env file first!');
        console.error('[HINT] Copy .env.example to .env and add your token');
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    // Check if CLIENT_ID is set
    if (!config.CLIENT_ID || config.CLIENT_ID === 'your-bot-id') {
        console.error('[ERROR] CLIENT_ID is not configured. Please set it in your .env file.');
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    // Create REST API instance
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

    // Determine deployment target
    const guildId = options.guild || (options.global ? null : config.GUILD_ID);
    const isGlobal = options.global || !guildId;

    try {
        if (options.clear) {
            if (isGlobal) {
                console.log('[INFO] Clearing all global commands...');
                await rest.put(
                    Routes.applicationCommands(config.CLIENT_ID),
                    { body: [] }
                );
                console.log('[SUCCESS] All global commands cleared!');
            } else {
                console.log(`[INFO] Clearing all commands for guild ${guildId}...`);
                await rest.put(
                    Routes.applicationGuildCommands(config.CLIENT_ID, guildId),
                    { body: [] }
                );
                console.log(`[SUCCESS] All commands cleared for guild ${guildId}!`);
            }
            return [];
        }

        if (!options.dryRun) {
            if (isGlobal) {
                console.log('[INFO] Deploying globally (production mode)...');
                await rest.put(
                    Routes.applicationCommands(config.CLIENT_ID),
                    { body: commands }
                );
                console.log('[SUCCESS] Commands deployed globally successfully!');
                console.log('[INFO] Global commands may take up to 1 hour to appear in all servers');
            } else {
                console.log(`[INFO] Deploying to guild ${guildId} (development mode)...`);
                await rest.put(
                    Routes.applicationGuildCommands(config.CLIENT_ID, guildId),
                    { body: commands }
                );
                console.log(`[SUCCESS] Commands deployed to guild ${guildId} successfully!`);
                console.log('[INFO] Commands will appear instantly in the specified server');
            }
        }

        return commands;

    } catch (error) {
        console.error('[ERROR] Error deploying commands:', error);
        process.exit(EXIT_CODES.DEPLOYMENT_ERROR);
    }
}

// Main execution
async function main() {
    const options = parseArgs();

    if (options.help) {
        printHelp();
        process.exit(EXIT_CODES.SUCCESS);
    }

    // For --clear --dry-run, we don't need to load commands
    if (options.clear && options.dryRun) {
        if (!options.json) {
            console.log('Discord Bot - Command Deployment');
            console.log('===================================\n');
        }
        const guildId = options.guild || (options.global ? null : config.GUILD_ID);
        const isGlobal = options.global || !guildId;
        if (isGlobal) {
            console.log('[DRY-RUN] Would clear all global commands');
        } else {
            console.log(`[DRY-RUN] Would clear all commands for guild ${guildId}`);
        }
        process.exit(EXIT_CODES.SUCCESS);
    }

    if (!options.json) {
        console.log('Discord Bot - Command Deployment');
        console.log('===================================\n');
    }

    const commands = await loadCommands();

    // Validate commands
    const warnings = validateCommands(commands);
    if (warnings.length > 0) {
        for (const warning of warnings) {
            console.warn(`[WARN] ${warning}`);
        }
        if (!options.dryRun && !options.json) {
            console.log(''); // spacing
        }
    }

    if (options.dryRun) {
        if (options.json) {
            console.log(JSON.stringify(commands, null, 2));
        } else {
            console.log(`[DRY-RUN] Would deploy ${commands.length} commands:`);
            commands.forEach((cmd, index) => {
                console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description || '(no description)'}`);
            });
        }
        process.exit(EXIT_CODES.SUCCESS);
    }

    const deployedCommands = await deployCommands(commands, options);

    if (options.json) {
        console.log(JSON.stringify(deployedCommands, null, 2));
    } else {
        console.log('\n[INFO] Deployed Commands:');
        deployedCommands.forEach((cmd, index) => {
            console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description || '(no description)'}`);
        });
        console.log('\n[SUCCESS] Deployment complete!');
    }

    process.exit(EXIT_CODES.SUCCESS);
}

main();