// Deploy Commands Script
// Registers slash commands with Discord for immediate use in a specific guild
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import { config } from '../src/config/config.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../src/utils/logger.js';

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
            logger.error(`[ERROR] Unknown argument: ${arg}`);
            process.exit(EXIT_CODES.CONFIG_ERROR);
        }
    }

    return options;
}

function printHelp() {
    logger.info('Discord Bot - Command Deployment');
    logger.info('===================================\n');
    logger.info('Usage: node scripts/deploy-commands.js [options]\n');
    logger.info('Options:');
    logger.info('  --guild <id>     Deploy to specific guild (overrides GUILD_ID env)');
    logger.info('  --global         Force global deployment (ignores GUILD_ID)');
    logger.info('  --dry-run        Print commands without deploying');
    logger.info('  --clear          Delete all commands (guild or global)');
    logger.info('  --json           Output JSON array of deployed commands');
    logger.info('  --help, -h       Show this help message');
    logger.info('\nEnvironment variables:');
    logger.info('  DISCORD_TOKEN    Bot token (required)');
    logger.info('  CLIENT_ID        Application ID (required)');
    logger.info('  GUILD_ID         Guild ID for development deployment (optional)');
    logger.info('\nExit codes:');
    logger.info('  0  Success');
    logger.info('  1  Configuration error');
    logger.info('  2  Validation error');
    logger.info('  3  Deployment error');
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
        logger.error('[ERROR] Error loading commands:', error);
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    return commands;
}

// Deploy or clear commands
async function deployCommands(commands, options) {
    // Check if token is set
    if (config.DISCORD_TOKEN === 'your-token-here' || !config.DISCORD_TOKEN) {
        logger.error('[ERROR] Please set your Discord bot token in .env file first!');
        logger.error('[HINT] Copy .env.example to .env and add your token');
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    // Check if CLIENT_ID is set
    if (!config.CLIENT_ID || config.CLIENT_ID === 'your-bot-id') {
        logger.error('[ERROR] CLIENT_ID is not configured. Please set it in your .env file.');
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
                logger.info('[INFO] Clearing all global commands...');
                await rest.put(
                    Routes.applicationCommands(config.CLIENT_ID),
                    { body: [] }
                );
                logger.info('[SUCCESS] All global commands cleared!');
            } else {
                logger.info(`[INFO] Clearing all commands for guild ${guildId}...`);
                await rest.put(
                    Routes.applicationGuildCommands(config.CLIENT_ID, guildId),
                    { body: [] }
                );
                logger.info(`[SUCCESS] All commands cleared for guild ${guildId}!`);
            }
            return [];
        }

        if (!options.dryRun) {
            if (isGlobal) {
                logger.info('[INFO] Deploying globally (production mode)...');
                await rest.put(
                    Routes.applicationCommands(config.CLIENT_ID),
                    { body: commands }
                );
                logger.info('[SUCCESS] Commands deployed globally successfully!');
                logger.info('[INFO] Global commands may take up to 1 hour to appear in all servers');
            } else {
                logger.info(`[INFO] Deploying to guild ${guildId} (development mode)...`);
                await rest.put(
                    Routes.applicationGuildCommands(config.CLIENT_ID, guildId),
                    { body: commands }
                );
                logger.info(`[SUCCESS] Commands deployed to guild ${guildId} successfully!`);
                logger.info('[INFO] Commands will appear instantly in the specified server');
            }
        }

        return commands;

    } catch (error) {
        logger.error('[ERROR] Error deploying commands:', error);
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
            logger.info('Discord Bot - Command Deployment');
            logger.info('===================================\n');
        }
        const guildId = options.guild || (options.global ? null : config.GUILD_ID);
        const isGlobal = options.global || !guildId;
        if (isGlobal) {
            logger.info('[DRY-RUN] Would clear all global commands');
        } else {
            logger.info(`[DRY-RUN] Would clear all commands for guild ${guildId}`);
        }
        process.exit(EXIT_CODES.SUCCESS);
    }

    if (!options.json) {
        logger.info('Discord Bot - Command Deployment');
        logger.info('===================================\n');
    }

    const commands = await loadCommands();

    // Validate commands
    const warnings = validateCommands(commands);
    if (warnings.length > 0) {
        for (const warning of warnings) {
            logger.warn(`[WARN] ${warning}`);
        }
        if (!options.dryRun && !options.json) {
            logger.info(''); // spacing
        }
    }

    if (options.dryRun) {
        if (options.json) {
            logger.info(JSON.stringify(commands, null, 2));
        } else {
            logger.info(`[DRY-RUN] Would deploy ${commands.length} commands:`);
            commands.forEach((cmd, index) => {
                logger.info(`  ${index + 1}. /${cmd.name} - ${cmd.description || '(no description)'}`);
            });
        }
        process.exit(EXIT_CODES.SUCCESS);
    }

    const deployedCommands = await deployCommands(commands, options);

    if (options.json) {
        logger.info(JSON.stringify(deployedCommands, null, 2));
    } else {
        logger.info('\n[INFO] Deployed Commands:');
        deployedCommands.forEach((cmd, index) => {
            logger.info(`  ${index + 1}. /${cmd.name} - ${cmd.description || '(no description)'}`);
        });
        logger.info('\n[SUCCESS] Deployment complete!');
    }

    process.exit(EXIT_CODES.SUCCESS);
}

main();