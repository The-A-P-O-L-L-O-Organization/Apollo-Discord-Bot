import type { Plugin } from './Plugin.js';

export interface PluginDisablerOptions {
    workerHost: any;
    eventBus: any;
}

export class PluginDisabler {
    private workerHost: any;
    private eventBus: any;

    constructor(options: PluginDisablerOptions) {
        this.workerHost = options.workerHost;
        this.eventBus = options.eventBus;
    }

    async disable(pluginId: string, plugin: Plugin): Promise<void> {
        // Call onDisable
        if (plugin.onDisable) {
            await plugin.onDisable();
        }

        // Terminate worker
        await this.workerHost.terminateWorker(pluginId);

        // Unsubscribe all events (EventBus now supports this)
        await this.eventBus.unsubscribeAllForPlugin(pluginId);

        // Clear capability env var
        delete process.env[`PLUGIN_${pluginId.toUpperCase()}_CAPABILITIES`];
    }
}