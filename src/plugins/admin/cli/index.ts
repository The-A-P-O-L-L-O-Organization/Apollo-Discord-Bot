interface CLICommand {
    name: string;
    description: string;
    needsSocket?: boolean;
    options: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
    subcommands?: Array<{
        name: string;
        description: string;
        needsSocket?: boolean;
        options: Array<{
            name: string;
            description: string;
            required?: boolean;
        }>;
        execute?: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
}

const commands: CLICommand[] = [
    {
        name: 'system',
        description: 'System information',
        options: [],
        subcommands: [
            {
                name: 'info',
                description: 'Show bot process info',
                options: [],
                execute: async () => {
                    return {
                        uptime: process.uptime(),
                        memory: process.memoryUsage().rss,
                        heapUsed: process.memoryUsage().heapUsed,
                        nodeVersion: process.version,
                        platform: process.platform,
                        pid: process.pid
                    };
                }
            }
        ]
    },
    {
        name: 'plugin',
        description: 'Manage plugins',
        options: [],
        subcommands: [
            {
                name: 'enable',
                description: 'Enable a plugin',
                needsSocket: true,
                options: [{ name: 'id', description: 'Plugin ID', required: true }]
            },
            {
                name: 'disable',
                description: 'Disable a plugin',
                needsSocket: true,
                options: [{ name: 'id', description: 'Plugin ID', required: true }]
            },
            {
                name: 'reload',
                description: 'Reload a plugin',
                needsSocket: true,
                options: [{ name: 'id', description: 'Plugin ID', required: true }]
            },
            {
                name: 'install',
                description: 'Install a plugin',
                needsSocket: true,
                options: [{ name: 'id', description: 'Plugin ID', required: true }]
            },
            {
                name: 'uninstall',
                description: 'Uninstall a plugin',
                needsSocket: true,
                options: [{ name: 'id', description: 'Plugin ID', required: true }]
            }
        ]
    },
    {
        name: 'logging',
        description: 'Configure logging',
        needsSocket: true,
        options: [
            { name: 'setting', description: 'The setting to change', required: true },
            { name: 'value', description: 'The value to set', required: true }
        ]
    }
];

export default {
    name: 'admin',
    description: 'Administrative commands',
    commands
};