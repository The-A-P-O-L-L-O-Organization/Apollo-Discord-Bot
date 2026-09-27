import type { Plugin } from './Plugin.js';
import type { ParsedPluginManifest as PluginManifest } from './worker/pluginManifest.js';
import type { PluginLoader } from './PluginLoader.js';
import type { PluginDisabler } from './PluginDisabler.js';
import type { PluginEnabler } from './PluginEnabler.js';
import type { ApolloClient, PluginManager } from '../types/shared.js';

export interface PluginReloaderOptions {
    loader: PluginLoader;
    disabler: PluginDisabler;
    enabler: PluginEnabler;
}

export interface ReloadResult {
    plugin: Plugin;
    manifest: PluginManifest;
}

export class PluginReloader {
    private loader: PluginLoader;
    private disabler: PluginDisabler;
    private enabler: PluginEnabler;

    constructor(options: PluginReloaderOptions) {
        this.loader = options.loader;
        this.disabler = options.disabler;
        this.enabler = options.enabler;
    }

    async reload(pluginId: string, baseDir: string, client: ApolloClient, manager: PluginManager): Promise<ReloadResult> {
        const loaded = this.loader.getLoadedPlugin(pluginId);
        if (!loaded) {
            throw new Error(`Plugin ${pluginId} not loaded`);
        }

        // Disable first (using the instantiated plugin)
        await this.disabler.disable(pluginId, loaded.plugin);

        // Clear command module cache (for queue workers)
        this.loader.clearCache(pluginId);

        // Reload
        const { plugin: newPlugin, manifest } = await this.loader.load(pluginId, baseDir, client, manager);

        // Enable new version
        await this.enabler.enable(pluginId, newPlugin, manifest);

        return { plugin: newPlugin, manifest };
    }
}