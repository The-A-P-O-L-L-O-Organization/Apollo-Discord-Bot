export default {
    name: 'admin',
    description: 'Administrative commands',
    commands: [
        {
            name: 'system',
            description: 'System information',
            options: [],
            subcommands: [
                {
                    name: 'info',
                    description: 'Show bot process info',
                    options: [],
                    execute: async (args) => {
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
        }
    ]
};
