import type { Plugin } from './Plugin.js';
import type { ParsedPluginManifest as PluginManifest } from './worker/pluginManifest.js';
import { signCapabilities } from './worker/capabilitySignature.js';

export interface PluginEnablerOptions {
    workerHost: any;
    eventBus: any;
    commandSync: any;
}

export class PluginEnabler {
    private workerHost: any;
    private eventBus: any;
    private commandSync: any;
    private enabledPlugins = new Set<string>();

    constructor(options: PluginEnablerOptions) {
        this.workerHost = options.workerHost;
        this.eventBus = options.eventBus;
        this.commandSync = options.commandSync;
    }

    async enable(pluginId: string, plugin: Plugin, manifest: PluginManifest): Promise<void> {
        // Call onEnable
        if (plugin.onEnable) {
            await plugin.onEnable();
        }

        // Register events from eventHandlers
        for (const event of plugin.eventHandlers) {
            this.eventBus.subscribe(event.name, event.handler);
        }

        // Spawn worker if plugin has worker capabilities
        if (manifest.capabilities?.some((c) => c.startsWith('worker:'))) {
            await this.workerHost.spawnWorker(pluginId, manifest);
        }

        // Sync commands
        if (plugin.commands?.size) {
            await this.commandSync.syncCommands(pluginId, [...plugin.commands.values()]);
        }

        // Sign capabilities for worker
        const secret = process.env['PLUGIN_CAPABILITY_SECRET'] ?? process.env['QUEUE_HMAC_SECRET'];
        if (secret && manifest.capabilities) {
            const signed = signCapabilities(pluginId, manifest.capabilities, secret);
            process.env[`PLUGIN_${pluginId.toUpperCase()}_CAPABILITIES`] = JSON.stringify(signed);
        }

        this.enabledPlugins.add(pluginId);
    }

    isEnabled(pluginId: string): boolean {
        return this.enabledPlugins.has(pluginId);
    }
}