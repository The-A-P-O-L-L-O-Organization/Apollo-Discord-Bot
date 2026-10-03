import type { Plugin } from './Plugin.js';
import type { ParsedPluginManifest as PluginManifest } from './worker/pluginManifest.js';
import { parsePluginManifest } from './worker/pluginManifest.js';
import { verifyPluginFile } from '../utils/manifest.js';
import { pathToFileURL } from 'node:url';
import { join, relative, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { ApolloClient, PluginManager } from '../types/shared.js';

// PluginClass is the constructor type for Plugin subclasses
type PluginClass = new (client: ApolloClient, manager: PluginManager) => Plugin;

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

    async load(pluginId: string, baseDir: string, client: ApolloClient, manager: PluginManager): Promise<{ plugin: Plugin; manifest: PluginManifest }> {
        if (this.loadedPlugins.has(pluginId)) {
            return this.loadedPlugins.get(pluginId)!;
        }

        const pluginDir = join(process.cwd(), baseDir, pluginId);
        const manifestPath = join(pluginDir, 'plugin.json');

        if (!existsSync(manifestPath)) {
            throw new Error(`Plugin manifest not found at ${manifestPath}`);
        }

        // TOCTOU protection: verify plugin.js hash against manifest before import
        const manifestPathGlobal = join(process.cwd(), 'plugin-manifest.json');
        if (existsSync(manifestPathGlobal)) {
            const manifest = JSON.parse(readFileSync(manifestPathGlobal, 'utf8'));
            const pluginPath = join(pluginDir, 'plugin.ts');
            const relPath = relative(process.cwd(), pluginPath).split(sep).join('/');
            const expectedHash = manifest[relPath] as string | undefined;
            if (expectedHash) {
                verifyPluginFile(pluginPath, expectedHash);
            }
        }

        const plugin = await this.importPlugin(pluginId, pluginDir, client, manager);
        const manifest = await parsePluginManifest({ dir: pluginDir });

        this.loadedPlugins.set(pluginId, { plugin, manifest });
        return { plugin, manifest };
    }

    private async importPlugin(pluginId: string, pluginDir: string, client: ApolloClient, manager: PluginManager): Promise<Plugin> {
        const pluginPath = join(pluginDir, 'plugin.ts');
        const url = pathToFileURL(pluginPath).href + (process.env['NODE_ENV'] === 'development' ? `?t=${Date.now()}` : '');
        const mod = await import(url) as { default: PluginClass };
        const PluginClass = mod.default;
        if (!PluginClass) {
            throw new Error(`Plugin ${pluginId} does not export a default class`);
        }
        return new PluginClass(client, manager);
    }

    getLoadedPlugin(pluginId: string): { plugin: Plugin; manifest: PluginManifest } | undefined {
        return this.loadedPlugins.get(pluginId);
    }

    clearCache(pluginId: string): void {
        this.loadedPlugins.delete(pluginId);
    }
}