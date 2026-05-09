export default {
    name: 'plugin',
    description: 'Manage bot plugins (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    options: [
        {
            name: 'list',
            description: 'List all plugins and their status',
            type: 1
        },
        {
            name: 'enable',
            description: 'Enable a loaded plugin',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name',
                type: 3,
                required: true
            }]
        },
        {
            name: 'disable',
            description: 'Disable an enabled plugin',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name',
                type: 3,
                required: true
            }]
        },
        {
            name: 'reload',
            description: 'Hot-reload a plugin',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name',
                type: 3,
                required: true
            }]
        },
        {
            name: 'load',
            description: 'Load a new plugin from disk',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name',
                type: 3,
                required: true
            }]
        }
    ],

    async execute(interaction) {
        const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
        if (ownerIds.length > 0 && !ownerIds.includes(interaction.user.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Access Denied',
                    description: 'Only bot owners can use this command.',
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const manager = interaction.client.manager;

        switch (subcommand) {
            case 'list': {
                const plugins = manager.listPlugins();
                const discovered = manager.scanPlugins();
                const embed = {
                    color: 0x00FF00,
                    title: 'Plugin Manager',
                    fields: [
                        {
                            name: 'Loaded Plugins (' + plugins.length + ')',
                            value: plugins.map(p =>
                                '**' + p.id + '** v' + p.version +
                                ' — ' + (p.enabled ? '[ENABLED]' : '[DISABLED]')
                            ).join('\n') || 'None',
                            inline: false
                        },
                        {
                            name: 'Available on Disk',
                            value: discovered.filter(d => !plugins.find(p => p.id === d)).join(', ') || 'All loaded',
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            case 'enable': {
                const name = interaction.options.getString('name');
                try {
                    await manager.enablePlugin(name);
                    return interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Enabled',
                            description: '**' + name + '** has been enabled.',
                            timestamp: new Date().toISOString()
                        }],
                        ephemeral: true
                    });
                } catch (err) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: err.message
                        }],
                        ephemeral: true
                    });
                }
            }

            case 'disable': {
                const name = interaction.options.getString('name');
                try {
                    await manager.disablePlugin(name);
                    return interaction.reply({
                        embeds: [{
                            color: 0xFFA500,
                            title: '[SUCCESS] Plugin Disabled',
                            description: '**' + name + '** has been disabled.',
                            timestamp: new Date().toISOString()
                        }],
                        ephemeral: true
                    });
                } catch (err) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: err.message
                        }],
                        ephemeral: true
                    });
                }
            }

            case 'reload': {
                const name = interaction.options.getString('name');
                try {
                    await manager.reloadPlugin(name);
                    return interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Reloaded',
                            description: '**' + name + '** has been hot-reloaded.',
                            timestamp: new Date().toISOString()
                        }],
                        ephemeral: true
                    });
                } catch (err) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: err.message
                        }],
                        ephemeral: true
                    });
                }
            }

            case 'load': {
                const name = interaction.options.getString('name');
                try {
                    const plugin = await manager.loadPlugin(name);
                    await manager.enablePlugin(name);
                    return interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Loaded',
                            description: '**' + name + '** v' + plugin.constructor.version + ' loaded and enabled.',
                            timestamp: new Date().toISOString()
                        }],
                        ephemeral: true
                    });
                } catch (err) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: err.message
                        }],
                        ephemeral: true
                    });
                }
            }
        }
    }
};
