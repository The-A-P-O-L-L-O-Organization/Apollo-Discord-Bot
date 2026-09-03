// CLI types for Apollo bot administration

import type {
    PluginLogger,
    PluginDatabase,
    PluginQueue,
    PluginRPC,
    PluginScheduler,
    PluginInterlink,
    CLIContext as SharedCLIContext
} from './shared.js';

export interface CLIConfig {
    name: string;
    version: string;
    description: string;
    binName: string;
    commands: CLICommand[];
    globalOptions: CLIGlobalOption[];
    helpOptions: CLIHelpOptions;
}

export interface CLICommand {
    name: string;
    aliases?: string[];
    description: string;
    summary?: string;
    options: CLICommandOption[];
    arguments?: CLIArgument[];
    subcommands?: CLICommand[];
    action: CLIAction;
    hidden?: boolean;
    deprecated?: boolean;
    examples?: string[];
}

export interface CLICommandOption {
    name: string;
    short?: string;
    description: string;
    type: CLIParamType;
    required?: boolean;
    default?: unknown;
    choices?: string[];
    envVar?: string;
    conflicts?: string[];
    implies?: string[];
    hidden?: boolean;
}

export interface CLIArgument {
    name: string;
    description: string;
    type: CLIParamType;
    required?: boolean;
    default?: unknown;
    variadic?: boolean;
    choices?: string[];
}

export type CLIParamType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'array'
    | 'int'
    | 'float'
    | 'bigint';

export interface CLIGlobalOption {
    name: string;
    short?: string;
    description: string;
    type: CLIParamType;
    default?: unknown;
    envVar?: string;
    hidden?: boolean;
}

export interface CLIHelpOptions {
    sortOptions: boolean;
    sortSubcommands: boolean;
    showGlobalOptions: boolean;
    commandUsage: (cmd: CLICommand) => string;
    optionUsage: (opt: CLICommandOption) => string;
}

export type CLIAction = (options: ParsedCLIOptions, args: string[], context: CLIContext) => Promise<CLIResult> | CLIResult;

export interface ParsedCLIOptions {
    [key: string]: unknown;
    _: string[];
}

// Re-export shared CLIContext
export type CLIContext = SharedCLIContext;

export interface CLILogger {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    success: (msg: string, meta?: Record<string, unknown>) => void;
    table: (data: Record<string, unknown>[]) => void;
    progress: (task: CLIProgressBar) => void;
}

export interface CLIProgressBar {
    start: (total: number, initial?: number) => void;
    increment: (value?: number) => void;
    stop: () => void;
    update: (value: number) => void;
}

export interface CLIOutput {
    stdout: (msg: string) => void;
    stderr: (msg: string) => void;
    json: (data: unknown) => void;
    table: (data: Record<string, unknown>[]) => void;
}

export interface CLIResult {
    success: boolean;
    message?: string;
    data?: unknown;
    exitCode?: number;
}

export interface CLIError extends Error {
    code?: string;
    exitCode?: number;
    suggestions?: string[];
}

// Built-in CLI commands
export const BUILTIN_COMMANDS = [
    {
        name: 'start',
        description: 'Start the bot',
        options: [
            { name: 'gateway', short: 'g', description: 'Start in gateway mode', type: 'boolean' },
            { name: 'worker', short: 'w', description: 'Start in worker mode', type: 'boolean' },
            { name: 'shard', short: 's', description: 'Shard ID to start', type: 'int' }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'stop',
        description: 'Stop the bot',
        options: [
            { name: 'force', short: 'f', description: 'Force stop without graceful shutdown', type: 'boolean' },
            { name: 'timeout', short: 't', description: 'Shutdown timeout in seconds', type: 'int', default: 30 }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'restart',
        description: 'Restart the bot',
        options: [
            { name: 'gateway', short: 'g', description: 'Restart in gateway mode', type: 'boolean' },
            { name: 'worker', short: 'w', description: 'Restart in worker mode', type: 'boolean' }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'status',
        description: 'Show bot status',
        options: [
            { name: 'json', short: 'j', description: 'Output as JSON', type: 'boolean' },
            { name: 'watch', short: 'w', description: 'Watch for changes', type: 'boolean' }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'plugin',
        description: 'Manage plugins',
        subcommands: [
            {
                name: 'list',
                description: 'List all plugins',
                options: [
                    { name: 'enabled', short: 'e', description: 'Show only enabled plugins', type: 'boolean' },
                    { name: 'disabled', short: 'd', description: 'Show only disabled plugins', type: 'boolean' }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'enable',
                description: 'Enable a plugin',
                arguments: [{ name: 'name', description: 'Plugin name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'disable',
                description: 'Disable a plugin',
                arguments: [{ name: 'name', description: 'Plugin name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'reload',
                description: 'Reload a plugin',
                arguments: [{ name: 'name', description: 'Plugin name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'info',
                description: 'Show plugin info',
                arguments: [{ name: 'name', description: 'Plugin name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'install',
                description: 'Install a plugin from source',
                arguments: [{ name: 'source', description: 'Plugin source (path, git url, npm)', type: 'string', required: true }],
                options: [
                    { name: 'version', short: 'v', description: 'Specific version to install', type: 'string' }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'uninstall',
                description: 'Uninstall a plugin',
                arguments: [{ name: 'name', description: 'Plugin name', type: 'string', required: true }],
                action: async () => ({ success: true })
            }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'config',
        description: 'Manage configuration',
        subcommands: [
            {
                name: 'get',
                description: 'Get a config value',
                arguments: [{ name: 'key', description: 'Config key (dot notation)', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'set',
                description: 'Set a config value',
                arguments: [
                    { name: 'key', description: 'Config key (dot notation)', type: 'string', required: true },
                    { name: 'value', description: 'Value to set', type: 'string', required: true }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'list',
                description: 'List all config values',
                options: [
                    { name: 'section', short: 's', description: 'Filter by section', type: 'string' }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'validate',
                description: 'Validate configuration',
                action: async () => ({ success: true })
            }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'queue',
        description: 'Manage job queues',
        subcommands: [
            {
                name: 'list',
                description: 'List all queues',
                action: async () => ({ success: true })
            },
            {
                name: 'stats',
                description: 'Show queue statistics',
                arguments: [{ name: 'name', description: 'Queue name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'clean',
                description: 'Clean completed/failed jobs',
                options: [
                    { name: 'age', short: 'a', description: 'Max age in ms', type: 'int', default: 3600000 },
                    { name: 'count', short: 'c', description: 'Max count to keep', type: 'int', default: 1000 },
                    { name: 'type', short: 't', description: 'Job type to clean', type: 'string', choices: ['completed', 'failed', 'all'] }
                ],
                arguments: [{ name: 'name', description: 'Queue name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'retry',
                description: 'Retry failed jobs',
                options: [
                    { name: 'job-id', description: 'Specific job ID to retry', type: 'string' }
                ],
                arguments: [{ name: 'name', description: 'Queue name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'pause',
                description: 'Pause a queue',
                arguments: [{ name: 'name', description: 'Queue name', type: 'string', required: true }],
                action: async () => ({ success: true })
            },
            {
                name: 'resume',
                description: 'Resume a paused queue',
                arguments: [{ name: 'name', description: 'Queue name', type: 'string', required: true }],
                action: async () => ({ success: true })
            }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'health',
        description: 'Check system health',
        options: [
            { name: 'json', short: 'j', description: 'Output as JSON', type: 'boolean' },
            { name: 'verbose', short: 'v', description: 'Verbose output', type: 'boolean' }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'logs',
        description: 'View recent logs',
        options: [
            { name: 'lines', short: 'n', description: 'Number of lines', type: 'int', default: 100 },
            { name: 'level', short: 'l', description: 'Log level filter', type: 'string', choices: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] },
            { name: 'follow', short: 'f', description: 'Follow log output', type: 'boolean' }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'backup',
        description: 'Manage backups',
        subcommands: [
            {
                name: 'create',
                description: 'Create a backup',
                options: [
                    { name: 'type', short: 't', description: 'Backup type', type: 'string', choices: ['full', 'incremental'], default: 'full' },
                    { name: 'destination', short: 'd', description: 'Backup destination path', type: 'string' }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'list',
                description: 'List available backups',
                action: async () => ({ success: true })
            },
            {
                name: 'restore',
                description: 'Restore from backup',
                options: [
                    { name: 'force', description: 'Force restore without confirmation', type: 'boolean' }
                ],
                arguments: [{ name: 'file', description: 'Backup file path', type: 'string', required: true }],
                action: async () => ({ success: true })
            }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'interlink',
        description: 'Manage Interlink connections',
        subcommands: [
            {
                name: 'services',
                description: 'List registered services',
                options: [
                    { name: 'bot', description: 'Filter by bot ID', type: 'string' }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'call',
                description: 'Call a service method',
                options: [
                    { name: 'params', short: 'p', description: 'JSON parameters', type: 'string' }
                ],
                arguments: [
                    { name: 'bot', description: 'Target bot ID', type: 'string', required: true },
                    { name: 'service', description: 'Service name', type: 'string', required: true },
                    { name: 'method', description: 'Method name', type: 'string', required: true }
                ],
                action: async () => ({ success: true })
            }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'manifest',
        description: 'Manage plugin manifest',
        subcommands: [
            {
                name: 'generate',
                description: 'Generate plugin manifest',
                options: [
                    { name: 'output', short: 'o', description: 'Output file path', type: 'string' }
                ],
                action: async () => ({ success: true })
            },
            {
                name: 'verify',
                description: 'Verify plugin manifest integrity',
                arguments: [{ name: 'plugin', description: 'Plugin name or path', type: 'string', required: true }],
                action: async () => ({ success: true })
            }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'version',
        description: 'Show version information',
        options: [
            { name: 'json', short: 'j', description: 'Output as JSON', type: 'boolean' }
        ],
        action: async () => ({ success: true })
    },
    {
        name: 'help',
        description: 'Show help',
        arguments: [{ name: 'command', description: 'Command to show help for', type: 'string' }],
        action: async () => ({ success: true })
    }
] as const;

export interface CLIApplication {
    config: CLIConfig;
    program: unknown; // Commander.js Command instance
    run: (argv: string[]) => Promise<void>;
    registerCommand: (command: CLICommand) => void;
    unregisterCommand: (name: string) => void;
}