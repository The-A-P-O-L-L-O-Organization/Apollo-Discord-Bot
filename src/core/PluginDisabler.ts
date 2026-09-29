import type { Plugin } from './Plugin.js';

export interface WorkerHostLike {
    terminateWorker: (pluginId: string) => Promise<void>;
    isDisabled: (id: string) => boolean;
}

export interface EventBusLike {
    unsubscribeAllForPlugin: (pluginId: string) => Promise<void>;
}

export interface PluginDisablerOptions {
    workerHost: WorkerHostLike;
    eventBus: EventBusLike;
}

export class PluginDisabler {
    private workerHost: WorkerHostLike;
    private eventBus: EventBusLike;

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