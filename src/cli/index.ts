import { parseArgs } from './parse.js';
import { formatSuccess, formatError, formatInfo } from './format.js';
import { resolveCommand } from './discover.js';
import { sendSocketCommand } from './socket-client.js';
import type { CliArgs, CommandMap, CommandSpec } from '../types/cli.js';

export function generateHelp(commandMap: CommandMap): string {
    const lines = [formatInfo('Apollo Bot CLI — Terminal management tool\n')];
    lines.push('Usage: apollo <plugin> <command> [subcommand] [--flags]');
    lines.push('\nAvailable commands:');

    for (const [name, plugin] of Object.entries(commandMap)) {
        lines.push(`\n  ${name}:`);
        for (const cmd of plugin.commands) {
            const flagHelp = (cmd.options ?? []).map((o) =>
                `--${o.name}${o.required ? ' (required)' : ''}`
            ).join(' ');
            const subHelp = cmd.subcommands
                ? cmd.subcommands.map((s) => `  ${s.name} — ${s.description}`).join('\n')
                : '';
            lines.push(`    ${cmd.name} — ${cmd.description}`);
            if (flagHelp) { lines.push(`      Flags: ${flagHelp}`); }
            if (subHelp) { lines.push(subHelp); }
        }
    }

    lines.push('\n  Global flags:');
    lines.push('    --guild <id>  Target guild (or set APOLLO_GUILD_ID)');
    lines.push('    --help        Show this help');

    return lines.join('\n');
}

function formatResult(result: unknown): string {
    const display = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return formatSuccess(display);
}

function missingOptions(command: CommandSpec, args: CliArgs): string[] {
    return (command.options ?? []).filter((o) => o.required && args[o.name] === undefined).map((o) => `--${o.name}`);
}

export async function run(argv: string[], commandMap: CommandMap): Promise<string> {
    const { path, flags } = parseArgs(argv);

    if (flags['help'] === true || path.length === 0) {
        return generateHelp(commandMap ?? {});
    }

    const resolved = resolveCommand(commandMap, path);

    if (!resolved) {
        return formatError(`Unknown command: ${path.join(' ')}`);
    }

    const args: CliArgs = { ...flags };
    args.guild = args.guild ?? process.env['APOLLO_GUILD_ID'] ?? undefined;

    const missing = missingOptions(resolved.command, args);
    if (missing.length > 0) {
        return formatError(`Missing required option${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    }

    for (const opt of (resolved.command.options ?? [])) {
        const value = args[opt.name];
        const strValue = value as string | number | undefined;
        if (opt.choices && strValue !== undefined && !opt.choices.includes(String(strValue))) {
            return formatError(`--${opt.name} must be one of: ${opt.choices.join(', ')}`);
        }
    }

    if (resolved.command.needsSocket) {
        try {
            const commandName = `${resolved.plugin}.${resolved.command.name}`;
            const result = await sendSocketCommand(commandName, args);
            return formatResult(result);
        } catch (err) {
            return formatError(`Command failed: ${(err as Error).message}`);
        }
    }

    if (!resolved.command.execute && resolved.command.subcommands) {
        const lines = [formatInfo(`Subcommands of ${resolved.plugin} ${resolved.command.name}:\n`)];
        for (const sub of resolved.command.subcommands) {
            const flagHelp = (sub.options ?? []).map((o) =>
                `--${o.name}${o.required ? ' (required)' : ''}`
            ).join(' ');
            lines.push(`  ${sub.name} — ${sub.description}`);
            if (flagHelp) { lines.push(`    Flags: ${flagHelp}`); }
        }
        return lines.join('\n');
    }

    if (!resolved.command.execute) {
        return formatError(`Command has no action: ${resolved.plugin} ${resolved.command.name}`);
    }

    try {
        const result = await resolved.command.execute(args);
        return formatResult(result);
    } catch (err) {
        return formatError(`Command failed: ${(err as Error).message}`);
    }
}
