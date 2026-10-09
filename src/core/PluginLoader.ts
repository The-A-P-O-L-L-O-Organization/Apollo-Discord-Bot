import type { Plugin } from './Plugin.js';
import type { ParsedPluginManifest as PluginManifest } from './worker/pluginManifest.js';
import type { ApolloClient, PluginManager } from '../types/shared.js';

export interface PluginLoaderOptions {
    workerHost: { startPlugin: (opts: { pluginId: string; dir: string; capabilities: string[]; manifest: unknown }) => Promise<{ child: unknown; granted: string[]; manifest: unknown }>; terminateWorker: (id: string) => boolean; isDisabled: (id: string) => boolean };
    eventBus: { subscribe: (name: string, handler: (...args: unknown[]) => void) => void; unsubscribeAllForPlugin: (pluginId: string) => Promise<void> };
}

export class PluginLoader {
    private workerHost: { startPlugin: (opts: { pluginId: string; dir: string; capabilities: string[]; manifest: unknown }) => Promise<{ child: unknown; granted: string[]; manifest: unknown }>; terminateWorker: (id: string) => boolean; isDisabled: (id: string) => boolean };
    private eventBus: { subscribe: (name: string, handler: (...args: unknown[]) => void) => void; unsubscribeAllForPlugin: (pluginId: string) => Promise<void> };
    private loadedPlugins = new Map<string, { plugin: Plugin; manifest: PluginManifest }>();

    constructor(options: PluginLoaderOptions) {
        this.workerHost = options.workerHost;
        this.eventBus = options.eventBus;
    }

    load(_pluginId: string, _baseDir: string, _client: ApolloClient, _manager: PluginManager): Promise<{ plugin: Plugin; manifest: PluginManifest }> {
        return Promise.reject(new Error('PluginLoader.load is removed: installed plugins must start in a sandboxed worker via PluginManager.loadInstalledPlugin using the canonical plugin.js entry'));
    }

    getLoadedPlugin(pluginId: string): { plugin: Plugin; manifest: PluginManifest } | undefined {
        return this.loadedPlugins.get(pluginId);
    }

    clearCache(pluginId: string): void {
        this.loadedPlugins.delete(pluginId);
    }
}
