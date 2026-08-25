import { logger } from '../utils/logger.js';

import { readdirSync, existsSync, rmSync, readFileSync } from 'fs';
import path, { join, relative, sep } from 'path';
import { pathToFileURL } from 'url';
import { Routes } from 'discord.js';
import { verifyPluginManifest, verifyPluginFile } from '../utils/manifest.js';
import { WorkerHost } from './worker/workerHost.js';
import { parsePluginManifest } from './worker/pluginManifest.js';
import { commandModuleCache } from '../queue/jobs/processCommand.js';

const ALL_PLUGIN_CAPABILITIES = [
    'events:ready',
    'events:messageCreate',
    'events:messageDelete',
    'events:messageUpdate',
    'events:guildMemberAdd',
    'events:guildMemberRemove',
    'events:channelCreate',
    'api:sendMessage',
    'api:getOwnConfig',
    'api:setOwnConfig',
    'api:commandReply'
];

export default class PluginManager {
    constructor(client, bus) {
        this.client = client;
        this.bus = bus;
        this.plugins = new Map();
        this._pluginRegistry = new Map();
        this.installedPlugins = new Map();
        this.config = null;
        this.workerHost = new WorkerHost();
        // Capability index: capability -> Set<pluginId>
        this._capabilityIndex = new Map();
    }

    async loadAll(config) {
        const verify = await verifyPluginManifest();
        if (!verify.ok) {
            throw new Error('Plugin integrity verification failed. Run `pnpm manifest` and commit the updated plugin-manifest.json.');
        }
        this.config = config;
        const { enabled, directory } = config.plugins;
        this._rebuildInstalledPlugins();
        const allIds = [...new Set([
            ...enabled,
            ...[...this.installedPlugins.keys()].filter(id => !enabled.includes(id))
        ])];
        
        // Load all plugins in parallel (respecting dependencies)
        const loadPromises = allIds.map(id => {
            const baseDir = this.installedPlugins.has(id) ? this.config?.plugins?.optionalDirectory : directory;
            return this.loadPlugin(id, baseDir || directory);
        });
        await Promise.all(loadPromises);
        
        // Enable in dependency order with parallelization for independent plugins
        const sorted = this._sortByDependencies(allIds);
        await this._enablePluginsParallel(sorted);
        await this._syncDiscordCommands();
    }

    /**
     * Enables plugins in parallel where possible, respecting dependencies
     * Groups plugins by dependency level and enables each level in parallel
     */
    async _enablePluginsParallel(sortedIds) {
        // Build dependency graph
        const graph = new Map();
        const reverseGraph = new Map(); // dependents
        for (const id of sortedIds) {
            const PluginClass = this._pluginRegistry.get(id);
            const deps = PluginClass ? PluginClass.dependencies : [];
            graph.set(id, deps.filter(d => sortedIds.includes(d)));
            for (const dep of deps) {
                if (!reverseGraph.has(dep)) { reverseGraph.set(dep, new Set()); }
                reverseGraph.get(dep).add(id);
            }
        }
        
        // Calculate dependency levels (topological levels)
        const levels = new Map(); // id -> level
        const visited = new Set();
        
        function calculateLevel(id) {
            if (visited.has(id)) { return levels.get(id); }
            visited.add(id);
            
            const deps = graph.get(id) || [];
            if (deps.length === 0) {
                levels.set(id, 0);
                return 0;
            }
            
            let maxLevel = 0;
            for (const dep of deps) {
                const depLevel = calculateLevel(dep);
                maxLevel = Math.max(maxLevel, depLevel + 1);
            }
            levels.set(id, maxLevel);
            return maxLevel;
        }
        
        for (const id of sortedIds) {
            calculateLevel(id);
        }
        
        // Group by level
        const levelGroups = new Map();
        for (const [id, level] of levels) {
            if (!levelGroups.has(level)) { levelGroups.set(level, []); }
            levelGroups.get(level).push(id);
        }
        
        // Enable level by level (parallel within level)
        const maxLevel = Math.max(...levels.values());
        for (let level = 0; level <= maxLevel; level++) {
            const idsAtLevel = levelGroups.get(level) || [];
            if (idsAtLevel.length === 0) { continue; }
            
            // Enable all plugins at this level in parallel
            await Promise.all(idsAtLevel.map(id => this.enablePlugin(id)));
        }
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

    async _syncDiscordCommands(changedPluginId = null) {
        try {
            const rest = this.client.rest;
            const { CLIENT_ID } = this.client.config;
            if (!CLIENT_ID) {return;}
            
            if (changedPluginId) {
                // Incremental sync for a single plugin
                const plugin = this.plugins.get(changedPluginId);
                if (!plugin) {return;}
                
                const commands = plugin.getCommands?.() || [];
                const body = commands.map(cmd => {
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
                
                if (this.client.config.GUILD_ID) {
                    // Guild-specific update (instant)
                    await rest.put(
                        Routes.applicationGuildCommands(CLIENT_ID, this.client.config.GUILD_ID),
                        { body }
                    );
                } else {
                    // Global update (up to 1h propagation)
                    await rest.put(
                        Routes.applicationCommands(CLIENT_ID),
                        { body }
                    );
                }
            } else {
                // Full sync (startup only)
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
                await rest.put(
                    Routes.applicationCommands(CLIENT_ID),
                    { body }
                );
            }
        } catch (error) {
            logger.error('[ERROR] Failed to sync commands with Discord:', error);
        }
    }

    async loadPlugin(id, baseDir = './src/plugins') {
        if (this.plugins.has(id)) {return this.plugins.get(id);}

        let PluginClass = this._pluginRegistry.get(id);
        let pluginDir = path.join(process.cwd(), baseDir, id);
        if (!PluginClass) {
            pluginDir = path.join(process.cwd(), baseDir, id);
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

            // TOCTOU protection: verify plugin.js hash against manifest before import
            const manifestPath = join(process.cwd(), 'plugin-manifest.json');
            if (existsSync(manifestPath)) {
                const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
                const relPath = relative(process.cwd(), pluginPath).split(sep).join('/');
                const expectedHash = manifest[relPath];
                if (expectedHash) {
                    verifyPluginFile(pluginPath, expectedHash);
                }
            }

            const url = pathToFileURL(pluginPath).href + (process.env.NODE_ENV === 'development' ? `?t=${Date.now()}` : '');
            const mod = await import(url);
            PluginClass = mod.default;
            this._pluginRegistry.set(id, PluginClass);
        }

        const plugin = new PluginClass(this.client, this);
        plugin.setDirectory(pluginDir);
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
        
        // Update capability index for installed plugins with workers
        const info = this.installedPlugins.get(id);
        if (info?.origin === 'installed' && info.worker) {
            for (const cap of info.worker.granted) {
                if (!this._capabilityIndex.has(cap)) {
                    this._capabilityIndex.set(cap, new Set());
                }
                this._capabilityIndex.get(cap).add(id);
            }
        }
    }

    async disablePlugin(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) {throw new Error(`Plugin ${id} not loaded`);}
        if (!plugin._enabled) {return;}
        await plugin.onDisable();
        this.bus.removeAll(id);
        plugin._enabled = false;
        
        // Remove from capability index
        const info = this.installedPlugins.get(id);
        if (info?.origin === 'installed' && info.worker) {
            for (const cap of info.worker.granted) {
                this._capabilityIndex.get(cap)?.delete(id);
            }
        }
    }

    async reloadPlugin(id) {
        await this.disablePlugin(id);
        await this.unloadPlugin(id);
        this._pluginRegistry.delete(id);
        // Clear command module cache for this plugin
        for (const key of commandModuleCache.keys()) {
            if (key.startsWith(`${id}:`)) {
                commandModuleCache.delete(key);
            }
        }
        const installed = this.installedPlugins.get(id);
        const baseDir = installed?.origin === 'installed'
            ? (this.config?.plugins?.optionalDirectory || './data/plugins')
            : (this.config?.plugins?.directory || './src/plugins');
        await this.loadPlugin(id, baseDir);
        await this.enablePlugin(id);
        await this._syncDiscordCommands(id);
    }

    async installPlugin(id) {
        if (this.plugins.has(id)) {throw new Error(`Plugin ${id} is already loaded`);}

        const { default: PluginRegistry } = await import('./PluginRegistry.js');
        const registry = new PluginRegistry(
            this.client.config.plugins.registryFile || './data/plugins/registry.json'
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

        logger.info(`[PluginManager] Downloading ${id} from ${entry.downloadUrl}...`);
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

        await this.loadInstalledPlugin(id, destDir);
        await this._syncDiscordCommands(id);

        logger.info(`[PluginManager] Successfully installed plugin ${id}`);
    }

    async loadInstalledPlugin(pluginId, dir, manifest) {
        if (!manifest) {
            manifest = await parsePluginManifest({ dir });
        }
        const worker = await this.workerHost.startPlugin({
            pluginId,
            dir,
            capabilities: ALL_PLUGIN_CAPABILITIES,
            manifest
        });
        this.installedPlugins.set(pluginId, { origin: 'installed', dir, worker });
        return worker;
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
            logger.info(`[PluginManager] Removed plugin directory ${pluginDir}`);
        } else {
            throw new Error(`Plugin ${id} is not loaded and no install directory found at ${pluginDir}`);
        }

        const enabled = this.client.config.plugins.enabled;
        const idx = enabled.indexOf(id);
        if (idx !== -1) {enabled.splice(idx, 1);}

        await this._syncDiscordCommands(id);

        logger.info(`[PluginManager] Successfully uninstalled plugin ${id}`);
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

    registerSocketHandler(namespace, handler) {
        if (!this._socketHandlers) {this._socketHandlers = new Map();}
        this._socketHandlers.set(namespace, handler);
    }

    getSocketHandler(namespace) {
        if (!this._socketHandlers) {return null;}
        return this._socketHandlers.get(namespace) || null;
    }
}
