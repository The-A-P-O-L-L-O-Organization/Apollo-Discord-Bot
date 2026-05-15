import { parseArgs } from './parse.js';
import { formatSuccess, formatError, formatInfo } from './format.js';

export function generateHelp(commandMap) {
    const lines = [formatInfo('Apollo Bot CLI — Terminal management tool\n')];
    lines.push('Usage: apollo <plugin> <command> [subcommand] [--flags]');
    lines.push('\nAvailable commands:');

    for (const [name, plugin] of Object.entries(commandMap)) {
        lines.push(`\n  ${name}:`);
        for (const cmd of plugin.commands) {
            const flagHelp = cmd.options.map(o =>
                `--${o.name}${o.required ? ' (required)' : ''}`
            ).join(' ');
            const subHelp = cmd.subcommands
                ? cmd.subcommands.map(s => `  ${s.name} — ${s.description}`).join('\n')
                : '';
            lines.push(`    ${cmd.name} — ${cmd.description}`);
            if (flagHelp) lines.push(`      Flags: ${flagHelp}`);
            if (subHelp) lines.push(subHelp);
        }
    }

    lines.push(`\n  Global flags:`);
    lines.push(`    --guild <id>  Target guild (or set APOLLO_GUILD_ID)`);
    lines.push(`    --help        Show this help`);

    return lines.join('\n');
}

export async function run(argv, commandMap) {
    const { path, flags } = parseArgs(argv);

    if (flags.help || path.length === 0) {
        return generateHelp(commandMap || {});
    }

    const { resolveCommand } = await import('./discover.js');
    const resolved = resolveCommand(commandMap, path);

    if (!resolved) {
        return formatError(`Unknown command: ${path.join(' ')}`);
    }

    const args = { ...flags };
    args.guild = args.guild || process.env.APOLLO_GUILD_ID || undefined;

    const missing = (resolved.command.options || []).filter(o => o.required && !args[o.name]);
    if (missing.length > 0) {
        return formatError(`Missing required option${missing.length > 1 ? 's' : ''}: ${missing.map(o => `--${o.name}`).join(', ')}`);
    }

    for (const opt of (resolved.command.options || [])) {
        if (opt.choices && args[opt.name] && !opt.choices.includes(args[opt.name])) {
            return formatError(`--${opt.name} must be one of: ${opt.choices.join(', ')}`);
        }
    }

    if (resolved.command.needsSocket) {
        try {
            const { sendSocketCommand } = await import('./socket-client.js');
            const commandName = `${resolved.plugin}.${resolved.command.name}`;
            const result = await sendSocketCommand(commandName, args);
            const display = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            return formatSuccess(display);
        } catch (err) {
            return formatError(`Command failed: ${err.message}`);
        }
    }

    try {
        const result = await resolved.command.execute(args);
        const display = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return formatSuccess(display);
    } catch (err) {
        return formatError(`Command failed: ${err.message}`);
    }
}
