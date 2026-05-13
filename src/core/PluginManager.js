import { readdirSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Routes } from 'discord.js';

export default class PluginManager {
    constructor(client, bus) {
        this.client = client;
        this.bus = bus;
        this.plugins = new Map();
        this._pluginRegistry = new Map();
        this.installedPlugins = new Map();
        this.config = null;
    }

    async loadAll(config) {
        this.config = config;
        const { enabled, directory } = config.plugins;
        this._rebuildInstalledPlugins();
        const allIds = [...new Set([
            ...enabled,
            ...[...this.installedPlugins.keys()].filter(id => !enabled.includes(id))
        ])];
        for (const id of allIds) {
            const baseDir = this.installedPlugins.has(id) ? this.config?.plugins?.optionalDirectory : directory;
            await this.loadPlugin(id, baseDir || directory);
        }
        const sorted = this._sortByDependencies(allIds);
        for (const id of sorted) {
            await this.enablePlugin(id);
        }
        await this._syncDiscordCommands();
    }

    _rebuildInstalledPlugins() {
        const optionalDir = path.join(
            process.cwd(),
            this.config?.plugins?.optionalDirectory || './data/plugins'
        );
        if (!existsSync(optionalDir)) {return;}
        const entries = readdirSync(optionalDir);
        for (const entry of entries) {
            if (!this.installedPlugins.has(entry) && existsSync(path.join(optionalDir, entry, 'plugin.js'))) {
                this.installedPlugins.set(entry, {
                    origin: 'installed',
                    dir: path.join(optionalDir, entry)
                });
            }
        }
    }

    _sortByDependencies(ids) {
        const idSet = new Set(ids);
        const visited = new Set();
        const sorted = [];

        function visit(id, graph, path) {
            if (path.has(id)) {throw new Error(`Circular dependency detected: ${[...path, id].join(' -> ')}`);}
            if (visited.has(id)) {return;}
            visited.add(id);
            path.add(id);
            for (const dep of graph.get(id) || []) {
                if (idSet.has(dep)) {visit(dep, graph, path);}
            }
            path.delete(id);
            sorted.push(id);
        }

        const graph = new Map();
        for (const id of ids) {
            const PluginClass = this._pluginRegistry.get(id);
            graph.set(id, PluginClass ? PluginClass.dependencies : []);
        }

        for (const id of ids) {
            visit(id, graph, new Set());
        }

        return sorted;
    }

    async _syncDiscordCommands() {
        try {
            const body = [...this.client.commands.values()].map(cmd => {
                if (cmd.data) {
                    return cmd.data.toJSON();
                }
                const isContextMenu = cmd.type === 2 || cmd.type === 3;
                return {
                    name: cmd.name,
                    description: isContextMenu ? undefined : (cmd.description || 'No description'),
                    type: cmd.type || 1,
                    options: cmd.options || [],
                    dm_permission: cmd.dmPermission
                };
            });
            const rest = this.client.rest;
            const { CLIENT_ID } = this.client.config;
            if (!CLIENT_ID) {return;}
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body }
            );
        } catch (error) {
            console.error('[ERROR] Failed to sync commands with Discord:', error);
        }
    }

    async loadPlugin(id, baseDir = './src/plugins') {
        if (this.plugins.has(id)) {return this.plugins.get(id);}

        let PluginClass = this._pluginRegistry.get(id);
        if (!PluginClass) {
            let pluginDir = path.join(process.cwd(), baseDir, id);
            let pluginPath = path.join(pluginDir, 'plugin.js');
            if (!existsSync(pluginPath)) {
                const optionalDir = path.join(
                    process.cwd(),
                    this.config?.plugins?.optionalDirectory || './data/plugins',
                    id
                );
                const optionalPath = path.join(optionalDir, 'plugin.js');
                if (existsSync(optionalPath)) {
                    pluginDir = optionalDir;
                    pluginPath = optionalPath;
                } else {
                    throw new Error(`Plugin ${id} not found at ${pluginPath}`);
                }
            }

            const url = pathToFileURL(pluginPath).href + `?t=${Date.now()}`;
            const mod = await import(url);
            PluginClass = mod.default;
            this._pluginRegistry.set(id, PluginClass);
        }

        const plugin = new PluginClass(this.client, this);
        plugin.setDirectory(path.join(process.cwd(), baseDir, id));
        await plugin.onLoad();
        plugin._loaded = true;
        this.plugins.set(id, plugin);

        const optionalDir = this.client.config.plugins?.optionalDirectory || './data/plugins';
        const isOptional = plugin._dir.startsWith(path.join(process.cwd(), optionalDir));
        this.installedPlugins.set(id, {
            origin: isOptional ? 'installed' : 'built-in',
            dir: plugin._dir
        });

        return plugin;
    }

    async unloadPlugin(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) {throw new Error(`Plugin ${id} not loaded`);}
        if (plugin._enabled) {throw new Error(`Disable plugin ${id} before unloading`);}
        await plugin.onUnload();
        plugin._loaded = false;
        this.plugins.delete(id);
    }

    async enablePlugin(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) {throw new Error(`Plugin ${id} not loaded`);}
        if (plugin._enabled) {return;}

        for (const depId of plugin.constructor.dependencies) {
            const dep = this.plugins.get(depId);
            if (!dep || !dep._enabled) {
                throw new Error(`Dependency ${depId} not enabled for plugin ${id}`);
            }
        }

        this.bus.removeAll(id);
        await plugin.onEnable();
        plugin._enabled = true;
    }

    async disablePlugin(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) {throw new Error(`Plugin ${id} not loaded`);}
        if (!plugin._enabled) {return;}
        await plugin.onDisable();
        this.bus.removeAll(id);
        plugin._enabled = false;
    }

    async reloadPlugin(id) {
        await this.disablePlugin(id);
        await this.unloadPlugin(id);
        this._pluginRegistry.delete(id);
        const installed = this.installedPlugins.get(id);
        const baseDir = installed?.origin === 'installed'
            ? (this.config?.plugins?.optionalDirectory || './data/plugins')
            : (this.config?.plugins?.directory || './src/plugins');
        await this.loadPlugin(id, baseDir);
        await this.enablePlugin(id);
        await this._syncDiscordCommands();
    }

    async installPlugin(id) {
        if (this.plugins.has(id)) {throw new Error(`Plugin ${id} is already loaded`);}

        const { default: PluginRegistry } = await import('./PluginRegistry.js');
        const registry = new PluginRegistry(
            this.client.config.plugins.registryFile || './data/plugin-registry.json'
        );

        const entry = registry.get(id);
        if (!entry) {throw new Error(`Plugin ${id} not found in registry`);}

        const { downloadAndExtractPlugin, validatePluginDirectory } = await import('./pluginDownloader.js');

        const destDir = path.join(
            process.cwd(),
            this.client.config.plugins.optionalDirectory || './data/plugins',
            id
        );

        if (existsSync(destDir)) {
            throw new Error(`Plugin ${id} is already installed at ${destDir}`);
        }

        console.log(`[PluginManager] Downloading ${id} from ${entry.downloadUrl}...`);
        await downloadAndExtractPlugin(entry.downloadUrl, destDir);

        const validation = await validatePluginDirectory(destDir);
        if (!validation.valid) {
            rmSync(destDir, { recursive: true, force: true });
            throw new Error(`Invalid plugin ${id}: ${validation.error}`);
        }

        const enabled = this.client.config.plugins.enabled;
        if (!enabled.includes(id)) {
            enabled.push(id);
        }

        await this.loadPlugin(id, this.client.config.plugins.optionalDirectory || './data/plugins');
        await this.enablePlugin(id);
        await this._syncDiscordCommands();

        console.log(`[PluginManager] Successfully installed plugin ${id}`);
    }

    async uninstallPlugin(id) {
        if (this.plugins.has(id)) {
            const info = this.installedPlugins.get(id);
            if (!info || info.origin !== 'installed') {
                throw new Error(`Plugin ${id} is a built-in plugin and cannot be uninstalled`);
            }
            await this.disablePlugin(id);
            await this.unloadPlugin(id);
            this._pluginRegistry.delete(id);
            this.installedPlugins.delete(id);
        }

        const optionalDir = path.join(
            process.cwd(),
            this.client.config.plugins.optionalDirectory || './data/plugins'
        );
        const pluginDir = path.join(optionalDir, id);

        if (existsSync(pluginDir)) {
            rmSync(pluginDir, { recursive: true, force: true });
            console.log(`[PluginManager] Removed plugin directory ${pluginDir}`);
        } else {
            throw new Error(`Plugin ${id} is not loaded and no install directory found at ${pluginDir}`);
        }

        const enabled = this.client.config.plugins.enabled;
        const idx = enabled.indexOf(id);
        if (idx !== -1) {enabled.splice(idx, 1);}

        await this._syncDiscordCommands();

        console.log(`[PluginManager] Successfully uninstalled plugin ${id}`);
    }

    getPlugin(id) { return this.plugins.get(id) || null; }

    isEnabled(id) {
        const p = this.plugins.get(id);
        return p ? p._enabled : false;
    }

    listPlugins() {
        return [...this.plugins.entries()].map(([id, p]) => ({
            id,
            version: p.constructor.version,
            loaded: p._loaded,
            enabled: p._enabled
        }));
    }

    scanPlugins(baseDir = './src/plugins') {
        const absDir = path.join(process.cwd(), baseDir);
        if (!existsSync(absDir)) {return [];}
        return readdirSync(absDir).filter(name => {
            return existsSync(path.join(absDir, name, 'plugin.js'));
        });
    }
}
