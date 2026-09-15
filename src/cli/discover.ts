import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CommandMap, CommandSpec, PluginCLI, ResolvedCommand } from '../types/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = join(__dirname, '../plugins');

function isPluginCLI(value: unknown): value is PluginCLI {
    if (typeof value !== 'object' || value === null) { return false; }
    const commands = (value as { commands?: unknown }).commands;
    return Array.isArray(commands);
}

export async function discoverCommands(): Promise<CommandMap> {
    const commandMap: CommandMap = {};

    let pluginDirs;
    try {
        pluginDirs = readdirSync(PLUGINS_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory());
    } catch {
        return commandMap;
    }

    for (const dir of pluginDirs) {
        const cliPath = join(PLUGINS_DIR, dir.name, 'cli', 'index.js');
        try {
            const mod: { default?: unknown } = await import(pathToFileURL(cliPath).href);
            if (mod.default && isPluginCLI(mod.default)) {
                commandMap[dir.name] = mod.default;
            }
        } catch {
            // No cli/ directory — skip silently
        }
    }

    return commandMap;
}

export function resolveCommand(commandMap: CommandMap, path: string[]): ResolvedCommand | null {
    if (path.length < 2) { return null; }

    const [pluginName, ...rest] = path as [string, ...string[]];
    const plugin = commandMap[pluginName];
    if (!plugin) { return null; }

    let currentCommands: CommandSpec[] = plugin.commands;
    let matchedCommand: CommandSpec | null = null;

    for (let i = 0; i < rest.length; i++) {
        const name = rest[i]!;
        const cmd = currentCommands.find((c) => c.name === name);
        if (!cmd) { return null; }

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
