import { safeError } from '../../../utils/safeError.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'plugin',
    description: 'Manage bot plugins (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    canQueue: false,
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
        },
        {
            name: 'install',
            description: 'Download and install a plugin from the registry',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name from the registry',
                type: 3,
                required: true
            }, {
                name: 'confirm',
                description: 'Confirm installation of third-party plugin code',
                type: 5,
                required: true
            }]
        },
        {
            name: 'uninstall',
            description: 'Remove an installed plugin',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name to remove',
                type: 3,
                required: true
            }]
        },
        {
            name: 'search',
            description: 'Search available plugins in the registry',
            type: 1,
            options: [{
                name: 'query',
                description: 'Search term',
                type: 3,
                required: true
            }]
        },
        {
            name: 'update',
            description: 'Re-download and reload an installed plugin',
            type: 1,
            options: [{
                name: 'name',
                description: 'Plugin name to update',
                type: 3,
                required: true
            }]
        }
    ],

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const denial = await requireOwner(interaction);
            if (denial) {
                return interaction.editReply(denial);
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
                            value: plugins.map(p => {
                                const installed = manager.installedPlugins.get(p.id);
                                const workerStatus = installed?.origin === 'installed'
                                    ? ' (worker: ' + (manager.workerHost?.isDisabled(p.id) ? 'disabled after crashes' : 'running') + ')'
                                    : '';
                                return '**' + p.id + '** v' + p.version +
                                    ' — ' + (p.enabled ? '[ENABLED]' : '[DISABLED]') + workerStatus;
                            }).join('\n') || 'None',
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
                return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'enable': {
                const name = interaction.options.getString('name');
                try {
                    await manager.enablePlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Enabled',
                            description: '**' + name + '** has been enabled.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            case 'disable': {
                const name = interaction.options.getString('name');
                try {
                    await manager.disablePlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFFA500,
                            title: '[SUCCESS] Plugin Disabled',
                            description: '**' + name + '** has been disabled.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            case 'reload': {
                const name = interaction.options.getString('name');
                try {
                    await manager.reloadPlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Reloaded',
                            description: '**' + name + '** has been hot-reloaded.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            case 'load': {
                const name = interaction.options.getString('name');
                try {
                    const plugin = await manager.loadPlugin(name);
                    await manager.enablePlugin(name);
                    await manager._syncDiscordCommands();
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Loaded',
                            description: '**' + name + '** v' + plugin.constructor.version + ' loaded and enabled.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            case 'install': {
                const name = interaction.options.getString('name');
                const confirm = interaction.options.getBoolean('confirm');
                if (!confirm) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFFA500,
                            title: '[WARNING] Confirm Plugin Install',
                            description: 'Installing a third-party plugin runs arbitrary code from the registry. ' +
                                'It will run isolated from the main process. ' +
                                'Re-run with `confirm: true` to proceed.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                try {
                    await manager.installPlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Installed',
                            description: '**' + name + '** has been downloaded and enabled.',
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }]
                    });
                }
            }

            case 'uninstall': {
                const name = interaction.options.getString('name');
                try {
                    await manager.uninstallPlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFFA500,
                            title: '[SUCCESS] Plugin Uninstalled',
                            description: '**' + name + '** has been removed.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            case 'search': {
                const query = interaction.options.getString('query');
                const { default: PluginRegistry } = await import('../../../core/PluginRegistry.js');
                const registry = new PluginRegistry(
                    interaction.client.config.plugins.registryFile || './data/plugins/registry.json'
                );
                const results = registry.search(query);
                return interaction.editReply({
                    embeds: [{
                        color: 0x00BFFF,
                        title: 'Plugin Search: "' + query + '"',
                        description: results.length
                            ? results.map(r => '**' + r.id + '** v' + r.version + ' — ' + (r.name || r.id)).join('\n')
                            : 'No plugins found.',
                        fields: results.length ? [{
                            name: 'Install',
                            value: results.map(r => '`/plugin install ' + r.id + '`').join('\n')
                        }] : [],
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            case 'update': {
                const name = interaction.options.getString('name');
                try {
                    await manager.uninstallPlugin(name);
                    await manager.installPlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Plugin Updated',
                            description: '**' + name + '** has been re-downloaded and reloaded.',
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: '[ERROR]', description: safeError(err)
                        }]
                    });
                }
            }
        }
    
} catch (error) {
        const errorMessage = handleDiscordError(error);
        if (interaction.replied || interaction.deferred) {
            await safeFollowUp(interaction, errorMessage);
        } else {
            await safeReply(interaction, errorMessage);
        }
    }
}
};
