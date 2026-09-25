import { safeError } from '../../../utils/safeError.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { } from '../../../types/plugin.js';

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

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'admin');
            const denial = await requireOwner(interaction);
            if (denial) {
                return interaction.editReply(denial);
            }

            const subcommand = interaction.options.getSubcommand();
            // @ts-expect-error - manager property on client
            const manager = interaction.client.manager;

            switch (subcommand) {
            case 'list': {
                const plugins = manager.listPlugins();
                const discovered = manager.scanPlugins();
                const embed = {
                    color: 0x00FF00,
                    title: t('plugin.title'),
                    fields: [
                        {
                            name: t('plugin.loaded', { count: plugins.length }),
                            value: plugins.map((p: any) => {
                                const installed = manager.installedPlugins.get(p.id);
                                const workerStatus = installed?.origin === 'installed'
                                    ? ' (worker: ' + (manager.workerHost?.isDisabled(p.id) ? 'disabled after crashes' : 'running') + ')'
                                    : '';
                                return '**' + p.id + '** v' + p.version +
                                    ' — ' + (p.enabled ? '[ENABLED]' : '[DISABLED]') + workerStatus;
                            }).join('\n') ?? t('plugin.none'),
                            inline: false
                        },
                        {
                            name: t('plugin.available'),
                            value: discovered.filter((d: string) => !plugins.find((p: any) => p.id === d)).join(', ') ?? t('plugin.allLoaded'),
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                return interaction.editReply({ embeds: [embed] });
            }

            case 'enable': {
                const name = interaction.options.getString('name');
                try {
                    await manager.enablePlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: t('plugin.enabledTitle'),
                            description: t('plugin.enabledDescription', { name }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
                        }]
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
                            title: t('plugin.disabledTitle'),
                            description: t('plugin.disabledDescription', { name }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
                        }]
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
                            title: t('plugin.reloadedTitle'),
                            description: t('plugin.reloadedDescription', { name }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
                        }]
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
                            title: t('plugin.loadedTitle'),
                            description: t('plugin.loadedDescription', { name, version: (plugin.constructor as any).version }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
                        }]
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
                            title: t('plugin.confirmTitle'),
                            description: t('plugin.confirmDescription'),
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
                try {
                    await manager.installPlugin(name);
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: t('plugin.installedTitle'),
                            description: t('plugin.installedDescription', { name }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
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
                            title: t('plugin.uninstalledTitle'),
                            description: t('plugin.uninstalledDescription', { name }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
                        }]
                    });
                }
            }

            case 'search': {
                const query = interaction.options.getString('query') ?? '';
                const { default: PluginRegistry } = await import('../../../core/PluginRegistry.js');
                const clientWithConfig = interaction.client as unknown as { config: { plugins?: { registryFile?: string } } };
                const registry = new PluginRegistry(
                    clientWithConfig.config.plugins?.registryFile ?? './data/plugins/registry.json'
                );
                const results = registry.search(query);
                return interaction.editReply({
                    embeds: [{
                        color: 0x00BFFF,
                        title: t('plugin.searchTitle', { query }),
                        description: results.length
                            ? results.map((r: any) => '**' + r.id + '** v' + r.version + ' — ' + (r.name ?? r.id)).join('\n')
                            : t('plugin.noResults'),
                        fields: results.length ? [{
                            name: t('plugin.searchInstall'),
                            value: results.map((r: any) => '`/plugin install ' + r.id + '`').join('\n')
                        }] : [],
                        timestamp: new Date().toISOString()
                    }]
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
                            title: t('plugin.updatedTitle'),
                            description: t('plugin.updatedDescription', { name }),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000, title: t('plugin.errorTitle'), description: safeError(err)
                        }]
                    });
                }
            }
            }

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unexpected error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};