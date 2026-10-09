import { logger } from '../utils/logger.js';
import { readdirSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { verifyPluginManifest } from '../utils/manifest.js';
import { WorkerHost } from './worker/workerHost.js';
import { parsePluginManifest, type ParsedPluginManifest } from './worker/pluginManifest.js';
import type { WorkerInfo } from './worker/workerHost.js';
import type { Client, REST } from 'discord.js';
import type { EventBusImpl } from '../core/EventBus.js';
import type { Plugin as PluginBase } from '../core/Plugin.js';
import type { ApolloConfig } from '../types/config.js';
import type { ApolloClient, CommandModule } from '../types/shared.js';
import { PluginLoader } from './PluginLoader.js';
import { PluginEnabler } from './PluginEnabler.js';
import { PluginDisabler } from './PluginDisabler.js';
import { PluginReloader } from './PluginReloader.js';
import { PluginInstaller } from './PluginInstaller.js';
import { WorkerPluginProxy } from './WorkerPluginProxy.js';
import { sortByDependencies, enablePluginsParallel } from './PluginDependencyResolver.js';
import { CommandSync } from './CommandSync.js';
import { BuiltinPluginLoader } from './BuiltinPluginLoader.js';

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
    'api:commandReply',
    'api:i18n'
];

interface PluginInfo {
    origin: 'built-in' | 'installed';
    dir: string;
    worker?: { granted: string[] };
    proxy?: WorkerPluginProxy;
}

export interface PluginConstructor {
    id: string;
    dependencies: string[];
    version: string;
    requiredIntents: number[];
    requiredPartials: string[];
    new (_client: TypedClient, _manager: PluginManager): PluginBase;
}

export interface TypedClient extends Client {
    config: ApolloConfig;
    rest: REST;
    commands?: Map<string, unknown>;
}

export default class PluginManager {
    client: TypedClient;
    bus: EventBusImpl;
    plugins: Map<string, PluginBase>;
    _pluginRegistry: Map<string, PluginConstructor>;
    installedPlugins: Map<string, PluginInfo>;
    config: ApolloConfig | null;
    workerHost: WorkerHost;
    _capabilityIndex: Map<string, Set<string>>;
    _socketHandlers?: Map<string, (...args: unknown[]) => Promise<unknown>>;

    private _loader: PluginLoader;
    private _commandSync: CommandSync;
    private _enabler: PluginEnabler;
    private _disabler: PluginDisabler;
    private _reloader: PluginReloader;
    private _installer: PluginInstaller;
    private _builtinLoader = new BuiltinPluginLoader();

    constructor(client: TypedClient, bus: EventBusImpl) {
        this.client = client;
        this.bus = bus;
        this.plugins = new Map();
        this._pluginRegistry = new Map();
        this.installedPlugins = new Map();
        this.config = null;
        this.workerHost = new WorkerHost();
        this._capabilityIndex = new Map();

        // Initialize modular components - using type assertions to satisfy structural typing
        this._loader = new PluginLoader({ workerHost: this.workerHost as unknown as { startPlugin: (opts: { pluginId: string; dir: string; capabilities: string[]; manifest: unknown }) => Promise<{ child: unknown; granted: string[]; manifest: unknown }>; terminateWorker: (id: string) => boolean; isDisabled: (id: string) => boolean }, eventBus: this.bus });
        this._commandSync = new CommandSync(client);
        this._enabler = new PluginEnabler({ workerHost: this.workerHost as unknown as { startPlugin: (opts: { pluginId: string; dir: string; capabilities: string[]; manifest: unknown }) => Promise<{ child: unknown; granted: string[]; manifest: unknown }>; terminateWorker: (id: string) => boolean; isDisabled: (id: string) => boolean }, eventBus: this.bus, commandSync: this._commandSync });
        this._disabler = new PluginDisabler({ workerHost: this.workerHost, eventBus: this.bus });
        this._reloader = new PluginReloader({ loader: this._loader, disabler: this._disabler, enabler: this._enabler });
        this._installer = new PluginInstaller({ baseDir: './data/plugins' });
    }

    async loadAll(config: ApolloConfig): Promise<void> {
        const verify = await verifyPluginManifest();
        if (!verify.ok) {
            throw new Error('Plugin integrity verification failed. Run `pnpm manifest` and commit the updated plugin-manifest.json.');
        }
        this.config = config;
        const enabled = config.plugins.enabled;
        const paths = config.plugins.paths;
        const directory: string = paths.core;
        const installedDir: string = paths.installed;
        const enabledArray: string[] = Array.isArray(enabled) ? enabled : [enabled];
        this._rebuildInstalledPlugins();
        const installedKeys = [...this.installedPlugins.keys()];
        const additionalIds = installedKeys.filter(id => !enabledArray.includes(id));
        const allIds: string[] = [...enabledArray, ...additionalIds];

        // Load all plugins in parallel (respecting dependencies)
        const loadPromises = allIds.map(id => {
            const baseDir = this.installedPlugins.has(id) ? installedDir : directory;
            return this.loadPlugin(id, baseDir);
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
    async _enablePluginsParallel(sortedIds: string[]): Promise<void> {
        await enablePluginsParallel(sortedIds, id => this._pluginRegistry.get(id)?.dependencies ?? [], id => this.enablePlugin(id));
    }

    _rebuildInstalledPlugins(): void {
        const optionalDir = path.join(
            process.cwd(),
            this.config?.plugins?.paths?.installed ?? './data/plugins'
        );
        if (!existsSync(optionalDir)) { return; }
        const entries = readdirSync(optionalDir);
        for (const entry of entries) {
            if (!this.installedPlugins.has(entry) && (existsSync(path.join(optionalDir, entry, 'plugin.ts')) || existsSync(path.join(optionalDir, entry, 'plugin.js')))) {
                this.installedPlugins.set(entry, {
                    origin: 'installed',
                    dir: path.join(optionalDir, entry)
                });
            }
        }
    }

    _sortByDependencies(ids: string[]): string[] {
        return sortByDependencies(ids, id => this._pluginRegistry.get(id)?.dependencies ?? []);
    }

    async _syncDiscordCommands(changedPluginId: string | null = null): Promise<void> {
        if (changedPluginId) {
            const plugin = this.plugins.get(changedPluginId);
            if (!plugin) { return; }
            const maybeCommands = plugin.getCommands?.() as CommandModule[] | Promise<CommandModule[]> | undefined;
            await this._commandSync.syncCommands(changedPluginId, await maybeCommands ?? []);
        } else {
            await this._commandSync.syncAllCommands();
        }
    }

    async syncCommands(pluginId: string, commands: unknown[]): Promise<void> {
        await this._commandSync.syncCommands(pluginId, commands);
    }

    async loadPlugin(id: string, baseDir = './src/plugins'): Promise<PluginBase> {
        if (this.plugins.has(id)) { return this.plugins.get(id)!; }

        const loaded = this._loader.getLoadedPlugin(id);
        if (loaded) {
            this.plugins.set(id, loaded.plugin);
            return loaded.plugin;
        }

        // Check if this is an installed plugin (has plugin.json) or built-in
        const manifestPath = path.join(process.cwd(), baseDir, id, 'plugin.json');
        let plugin: PluginBase;

        if (existsSync(manifestPath)) {
            // Installed plugin - use PluginLoader
            const result = await this._loader.load(id, baseDir, this.client as unknown as ApolloClient, this);
            plugin = result.plugin;
        } else {
            // Built-in plugin - use direct import (original behavior)
            plugin = await this.loadBuiltinPlugin(id, baseDir);
        }

        // Register in PluginManager's registry and plugins map
        const PluginClass = plugin.constructor as PluginConstructor;
        this._pluginRegistry.set(id, PluginClass);
        this.plugins.set(id, plugin);

        // Set directory and call onLoad
        plugin.setDirectory(plugin.directory ?? '');
        await plugin.onLoad();
        plugin.loaded = true;

        const optionalDir = (this.client.config.plugins as { optionalDirectory?: string })?.optionalDirectory ?? './data/plugins';
        const pluginDirValue = plugin.directory;
        const isOptional = pluginDirValue?.startsWith(path.join(process.cwd(), optionalDir));
        this.installedPlugins.set(id, {
            origin: isOptional ? 'installed' : 'built-in',
            dir: pluginDirValue ?? ''
        });

        return plugin;
    }

    async loadBuiltinPlugin(id: string, baseDir = './src/plugins'): Promise<PluginBase> {
        let PluginClass = this._pluginRegistry.get(id);
        let pluginDir = path.join(process.cwd(), baseDir, id);
        if (!PluginClass) {
            const preferJs = process.env['NODE_ENV'] === 'production';
            const installedDir = this.config?.plugins?.paths?.installed ?? './data/plugins';
            const result = await this._builtinLoader.load(id, baseDir, preferJs, installedDir);
            PluginClass = result.PluginClass as unknown as PluginConstructor;
            pluginDir = result.pluginDir;
            this._pluginRegistry.set(id, PluginClass);
        }

        const plugin = new PluginClass(this.client, this);
        plugin.setDirectory(pluginDir);
        return plugin;
    }

    async unloadPlugin(id: string): Promise<void> {
        const plugin = this.plugins.get(id);
        if (!plugin) { throw new Error(`Plugin ${id} not loaded`); }
        if (plugin.enabled) { throw new Error(`Disable plugin ${id} before unloading`); }
        await plugin.onUnload();
        plugin.loaded = false;
        this.plugins.delete(id);
        this._loader.clearCache(id);
    }

    async enablePlugin(id: string): Promise<void> {
        const plugin = this.plugins.get(id);
        if (!plugin) { throw new Error(`Plugin ${id} not loaded`); }
        if (plugin.enabled) { return; }

        const PluginClass = (plugin.constructor as unknown as PluginConstructor);
        for (const depId of PluginClass.dependencies) {
            const dep = this.plugins.get(depId);
            if (!dep?.enabled) {
                throw new Error(`Dependency ${depId} not enabled for plugin ${id}`);
            }
        }

        this.bus.removeAll(id);
        const loaded = this._loader.getLoadedPlugin(id);
        const manifest = loaded?.manifest ?? { id, name: id, capabilities: [] };

        await this._enabler.enable(id, plugin, manifest);
        plugin.enabled = true;

        // Update capability index for installed plugins with workers
        const info = this.installedPlugins.get(id);
        if (info?.origin === 'installed' && info.worker) {
            for (const cap of info.worker.granted) {
                if (!this._capabilityIndex.has(cap)) {
                    this._capabilityIndex.set(cap, new Set());
                }
                this._capabilityIndex.get(cap)!.add(id);
            }
        }
    }

    async disablePlugin(id: string): Promise<void> {
        const plugin = this.plugins.get(id);
        if (!plugin) { throw new Error(`Plugin ${id} not loaded`); }
        if (!plugin.enabled) { return; }

        // For built-in plugins, we still need to call onDisable and remove events
        await this._disabler.disable(id, plugin);
        this.bus.removeAll(id);
        plugin.enabled = false;

        // Remove from capability index
        const info = this.installedPlugins.get(id);
        if (info?.origin === 'installed' && info.worker) {
            for (const cap of info.worker.granted) {
                this._capabilityIndex.get(cap)?.delete(id);
            }
        }
    }

    async reloadPlugin(id: string): Promise<void> {
        const result = await this._reloader.reload(id, './src/plugins', this.client as unknown as ApolloClient, this);
        // Update the plugins map with the new plugin instance
        this.plugins.set(id, result.plugin);
        await this._syncDiscordCommands(id);
    }

    async installPlugin(id: string): Promise<void> {
        if (this.plugins.has(id)) { throw new Error(`Plugin ${id} is already loaded`); }

        const { default: PluginRegistry } = await import('./PluginRegistry.js');
        const pluginsConfig = this.client.config.plugins as { registryFile?: string; paths?: { installed?: string }; enabled: string[] };
        const registry = new PluginRegistry(
            pluginsConfig.registryFile ?? './data/plugins/registry.json'
        );

        const entry = registry.get(id);
        if (!entry) { throw new Error(`Plugin ${id} not found in registry`); }

        const { downloadAndExtractPlugin, validatePluginDirectory } = await import('./pluginDownloader.js');

        const destDir = path.join(
            process.cwd(),
            pluginsConfig.paths?.installed ?? './data/plugins',
            id
        );

        if (existsSync(destDir)) {
            throw new Error(`Plugin ${id} is already installed at ${destDir}`);
        }

        logger.info({ msg: `[PluginManager] Downloading ${id} from ${entry.downloadUrl}...` });
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

        logger.info({ msg: `[PluginManager] Successfully installed plugin ${id}` });
    }

    async loadInstalledPlugin(pluginId: string, dir: string, manifest?: ParsedPluginManifest): Promise<WorkerInfo> {
        manifest ??= await parsePluginManifest({ dir });
        const worker = await this.workerHost.startPlugin({
            pluginId,
            dir,
            capabilities: ALL_PLUGIN_CAPABILITIES,
            manifest
        });
        await this.waitForWorkerReady(pluginId);
        const proxy = new WorkerPluginProxy(pluginId, this.workerHost, { dir });
        proxy.setDirectory(dir);
        this.plugins.set(pluginId, proxy as unknown as PluginBase);
        this.installedPlugins.set(pluginId, { origin: 'installed', dir, worker, proxy });
        await proxy.onLoad();
        proxy.loaded = true;
        await proxy.getCommands();
        await this._syncDiscordCommands(pluginId);
        return worker;
    }

    async waitForWorkerReady(pluginId: string): Promise<void> {
        if (this.workerHost.isWorkerReady(pluginId)) { return; }
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.workerHost.off('workerMessage', handler);
                reject(new Error(`Worker ready timeout for plugin ${pluginId}`));
            }, 10000);
            if (typeof timeout.unref === 'function') { timeout.unref(); }
            const handler = (msg: unknown): void => {
                if (typeof msg === 'object' && msg !== null &&
                    (msg as { type?: unknown }).type === 'lifecycle:ready' &&
                    (msg as { pluginId?: unknown }).pluginId === pluginId) {
                    clearTimeout(timeout);
                    this.workerHost.off('workerMessage', handler);
                    resolve();
                }
            };
            this.workerHost.on('workerMessage', handler);
        });
    }

    async uninstallPlugin(id: string): Promise<void> {
        const info = this.installedPlugins.get(id);
        if (this.plugins.has(id)) {
            if (info?.origin !== 'installed') {
                throw new Error(`Plugin ${id} is a built-in plugin and cannot be uninstalled`);
            }
            await this.disablePlugin(id);
            this.workerHost.terminateWorker(id);
            this.plugins.delete(id);
            this._loader.clearCache(id);
            this._pluginRegistry.delete(id);
            this.installedPlugins.delete(id);
        }

        const optionalDir = path.join(
            process.cwd(),
            (this.client.config.plugins as { optionalDirectory?: string }).optionalDirectory ?? './data/plugins'
        );
        const pluginDir = info?.dir ?? path.join(optionalDir, id);

        if (existsSync(pluginDir)) {
            rmSync(pluginDir, { recursive: true, force: true });
            logger.info({ msg: `[PluginManager] Removed plugin directory ${pluginDir}` });
        } else {
            throw new Error(`Plugin ${id} is not loaded and no install directory found at ${pluginDir}`);
        }

        const enabled = this.client.config.plugins.enabled;
        const idx = enabled.indexOf(id);
        if (idx !== -1) { enabled.splice(idx, 1); }

        await this._syncDiscordCommands(id);

        logger.info({ msg: `[PluginManager] Successfully uninstalled plugin ${id}` });
    }

    getPlugin(id: string): PluginBase | undefined { return this.plugins.get(id); }

    isEnabled(id: string): boolean {
        const p = this.plugins.get(id);
        return p ? p.enabled : false;
    }

    listPlugins(): { id: string; version: string; loaded: boolean; enabled: boolean }[] {
        return [...this.plugins.entries()].map(([id, p]) => ({
            id,
            version: (p.constructor as { version?: string }).version ?? '1.0.0',
            loaded: p.loaded,
            enabled: p.enabled
        }));
    }

    scanPlugins(baseDir = './src/plugins'): string[] {
        const absDir = path.join(process.cwd(), baseDir);
        if (!existsSync(absDir)) { return []; }
        return readdirSync(absDir).filter(name => {
            return existsSync(path.join(absDir, name, 'plugin.ts')) || existsSync(path.join(absDir, name, 'plugin.js'));
        });
    }

    registerSocketHandler(namespace: string, handler: (...args: unknown[]) => Promise<unknown>): void {
        this._socketHandlers ??= new Map();
        this._socketHandlers.set(namespace, handler);
    }

    getSocketHandler(namespace: string): ((...args: unknown[]) => Promise<unknown>) | null {
        if (!this._socketHandlers) { return null; }
        return this._socketHandlers.get(namespace) ?? null;
    }
}