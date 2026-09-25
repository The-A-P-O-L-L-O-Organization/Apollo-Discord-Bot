import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import { config } from '../src/config/config.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../src/utils/logger.js';
import { buildLocalizedPayload, checkCommandLocales, type CommandInput } from '../src/i18n/commandPayload.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXIT_CODES = {
    SUCCESS: 0,
    CONFIG_ERROR: 1,
    VALIDATION_ERROR: 2,
    DEPLOYMENT_ERROR: 3
} as const;

interface DeployOptions {
    guild: string | null;
    global: boolean;
    dryRun: boolean;
    clear: boolean;
    json: boolean;
    checkLocales: boolean;
    help: boolean;
}

interface CommandData {
    name: string;
    description?: string;
    type?: number;
    options?: unknown[];
}

function parseArgs(): DeployOptions {
    const args = process.argv.slice(2);
    const options: DeployOptions = {
        guild: null,
        global: false,
        dryRun: false,
        clear: false,
        json: false,
        checkLocales: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
        case '--guild':
            options.guild = args[++i] ?? null;
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
        case '--check-locales':
            options.checkLocales = true;
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

function printHelp(): void {
    logger.info('Discord Bot - Command Deployment');
    logger.info('===================================\n');
    logger.info('Usage: node scripts/deploy-commands.js [options]\n');
    logger.info('Options:');
    logger.info('  --guild <id>     Deploy to specific guild (overrides GUILD_ID env)');
    logger.info('  --global         Force global deployment (ignores GUILD_ID)');
    logger.info('  --dry-run        Print commands without deploying');
    logger.info('  --clear          Delete all commands (guild or global)');
    logger.info('  --json           Output JSON array of deployed commands');
    logger.info('  --check-locales  Validate command localization coverage and exit');
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

function validateCommands(commands: CommandData[]): string[] {
    const warnings: string[] = [];
    const seenNames = new Set<string>();

    for (const cmd of commands) {
        if (!cmd.description || cmd.description.trim() === '') {
            warnings.push(`Command "/${cmd.name}" has no description`);
        }

        if (seenNames.has(cmd.name)) {
            warnings.push(`Duplicate command name: "${cmd.name}"`);
        }
        seenNames.add(cmd.name);

        if (cmd.options) {
            for (const opt of cmd.options) {
                const type = (opt as { type?: unknown }).type;
                if (type !== undefined && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(type as number)) {
                    warnings.push(`Command "/${cmd.name}" option "${(opt as { name?: string }).name}" has invalid type: ${String(type)}`);
                }
            }
        }
    }

    return warnings;
}

interface RawCommandModule {
    default?: {
        data?: { toJSON: () => CommandData };
        name?: string;
        description?: string;
        type?: number;
        options?: unknown[];
    };
}

async function loadCommands(): Promise<CommandData[]> {
    const commands: CommandData[] = [];
    const pluginsDir = join(__dirname, '..', 'src', 'plugins');

    try {
        const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

        for (const plugin of pluginDirs) {
            const commandsPath = join(pluginsDir, plugin, 'commands');
            try {
                const commandFiles = readdirSync(commandsPath).filter(
                    (file) => file.endsWith('.js') || file.endsWith('.ts')
                );

                for (const file of commandFiles) {
                    const filePath = join(commandsPath, file);
                    const command = await import(pathToFileURL(filePath).href) as RawCommandModule;

                    if (command.default) {
                        const payload = buildLocalizedPayload(command.default as unknown as CommandInput, join(pluginsDir, plugin));
                        if (typeof payload['name'] !== 'string') {
                            continue;
                        }
                        commands.push(payload as unknown as CommandData);
                    }
                }
            } catch {
                // No commands directory for this plugin, skip
            }
        }

    } catch (error) {
        logger.error({ err: error as Error }, '[ERROR] Error loading commands');
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    return commands;
}

async function deployCommands(commands: CommandData[], options: DeployOptions): Promise<CommandData[]> {
    if (config.discord.token === 'your-token-here' || !config.discord.token) {
        logger.error('[ERROR] Please set your Discord bot token in .env file first!');
        logger.error('[HINT] Copy .env.example to .env and add your token');
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    if (!config.discord.clientId || config.discord.clientId === 'your-bot-id') {
        logger.error('[ERROR] CLIENT_ID is not configured. Please set it in your .env file.');
        process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    const guildId = options.guild ?? (options.global ? null : process.env['GUILD_ID'] ?? null);
    const isGlobal = options.global || !guildId;

    try {
        if (options.clear) {
            if (isGlobal) {
                logger.info('[INFO] Clearing all global commands...');
                await rest.put(
                    Routes.applicationCommands(config.discord.clientId),
                    { body: [] }
                );
                logger.info('[SUCCESS] All global commands cleared!');
            } else {
                logger.info(`[INFO] Clearing all commands for guild ${String(guildId)}...`);
                await rest.put(
                    Routes.applicationGuildCommands(config.discord.clientId, guildId!),
                    { body: [] }
                );
                logger.info(`[SUCCESS] All commands cleared for guild ${String(guildId)}!`);
            }
            return [];
        }

        if (!options.dryRun) {
            if (isGlobal) {
                logger.info('[INFO] Deploying globally (production mode)...');
                await rest.put(
                    Routes.applicationCommands(config.discord.clientId),
                    { body: commands }
                );
                logger.info('[SUCCESS] Commands deployed globally successfully!');
                logger.info('[INFO] Global commands may take up to 1 hour to appear in all servers');
            } else {
                logger.info(`[INFO] Deploying to guild ${String(guildId)} (development mode)...`);
                await rest.put(
                    Routes.applicationGuildCommands(config.discord.clientId, guildId!),
                    { body: commands }
                );
                logger.info(`[SUCCESS] Commands deployed to guild ${String(guildId)} successfully!`);
                logger.info('[INFO] Commands will appear instantly in the specified server');
            }
        }

        return commands;

    } catch (error) {
        logger.error({ err: error as Error }, '[ERROR] Error deploying commands');
        process.exit(EXIT_CODES.DEPLOYMENT_ERROR);
    }
}

async function main(): Promise<void> {
    const options = parseArgs();

    if (options.help) {
        printHelp();
        process.exit(EXIT_CODES.SUCCESS);
    }

    if (options.clear && options.dryRun) {
        if (!options.json) {
            logger.info('Discord Bot - Command Deployment');
            logger.info('===================================\n');
        }
        const guildId = options.guild ?? (options.global ? null : process.env['GUILD_ID'] ?? null);
        const isGlobal = options.global || !guildId;
        if (isGlobal) {
            logger.info('[DRY-RUN] Would clear all global commands');
        } else {
            logger.info(`[DRY-RUN] Would clear all commands for guild ${String(guildId)}`);
        }
        process.exit(EXIT_CODES.SUCCESS);
    }

    if (!options.json) {
        logger.info('Discord Bot - Command Deployment');
        logger.info('===================================\n');
    }

    const commands = await loadCommands();

    if (options.checkLocales) {
        const localeWarnings = checkCommandLocales(commands as unknown as Record<string, unknown>[]);
        for (const warning of localeWarnings) {
            logger.warn(`[WARN] ${warning}`);
        }
        logger.info(`[INFO] Checked ${commands.length} commands, ${localeWarnings.length} locale warnings`);
        process.exit(localeWarnings.length > 0 ? EXIT_CODES.VALIDATION_ERROR : EXIT_CODES.SUCCESS);
    }

    const warnings = validateCommands(commands);
    if (warnings.length > 0) {
        for (const warning of warnings) {
            logger.warn(`[WARN] ${warning}`);
        }
        if (!options.dryRun && !options.json) {
            logger.info('');
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

void main();
