import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = join(__dirname, '../plugins');

export async function discoverCommands() {
    const commandMap = {};

    let pluginDirs;
    try {
        pluginDirs = readdirSync(PLUGINS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());
    } catch {
        return commandMap;
    }

    for (const dir of pluginDirs) {
        const cliPath = join(PLUGINS_DIR, dir.name, 'cli/index.js');
        try {
            const mod = await import(cliPath);
            if (mod.default && mod.default.commands) {
                commandMap[dir.name] = mod.default;
            }
        } catch {
            // No cli/ directory — skip silently
        }
    }

    return commandMap;
}

export function resolveCommand(commandMap, path) {
    if (path.length < 2) return null;

    const [pluginName, ...rest] = path;
    const plugin = commandMap[pluginName];
    if (!plugin) return null;

    let currentCommands = plugin.commands;
    let matchedCommand = null;

    for (let i = 0; i < rest.length; i++) {
        const name = rest[i];
        const cmd = currentCommands.find(c => c.name === name);
        if (!cmd) return null;

        if (i === rest.length - 1) {
            matchedCommand = cmd;
        } else if (cmd.subcommands) {
            currentCommands = cmd.subcommands;
        } else {
            return null;
        }
    }

    return matchedCommand ? { plugin: pluginName, command: matchedCommand } : null;
}
