import type { Client } from 'discord.js';
import { logger } from '../utils/logger.js';
import type { CommandModule, EventHandlerModule } from '../types/plugin.js';

export type PluginDependencies = Record<string, string>;

export interface PluginConfig {
    enabled: string[];
    disabled: string[];
    directory: string;
    optionalDirectory: string;
}

export interface TypedClient extends Client {
    commands?: Map<string, CommandModule>;
}

export abstract class Plugin<C extends CommandModule = CommandModule, _E extends EventHandlerModule = EventHandlerModule> {
    public client: TypedClient;
    public manager: any; // PluginManager - JS file not migrated yet
    public bus: any; // EventBusImpl - TS file exists but types not exported
    public commands = new Map<string, C>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public eventHandlers: any[] = [];
    public schedulers: NodeJS.Timeout[] = [];
    protected _loaded = false;
    protected _enabled = false;
    protected _dir: string | null = null;

    constructor(client: TypedClient, manager: any) {
        if (this.constructor === Plugin) {
            throw new Error('Plugin is abstract; create a subclass that defines static id');
        }
        this.client = client;
        this.manager = manager;
        this.bus = manager.bus;
    }

    // Use proper static getter with type assertion
    static get id(): string {
        if (this === Plugin) { throw new Error('Plugin subclasses must override static id'); }
        throw new Error(`Plugin class "${this.name}" must override static get id()`);
    }

    static get dependencies(): string[] { return []; }
    static get version(): string { return '1.0.0'; }
    static get requiredIntents(): number[] { return []; }
    static get requiredPartials(): string[] { return []; }

    async onLoad(): Promise<void> {}
    async onUnload(): Promise<void> {}
    async onEnable(): Promise<void> {}
    async onDisable(): Promise<void> {}

    setDirectory(dir: string): void {
        this._dir = dir;
    }

    async _loadCommands(): Promise<void> {
        if (!this._dir) { return; }
        const { readdirSync } = await import('fs');
        const path = await import('path');
        const { pathToFileURL } = await import('url');

        const cmdDir = path.join(this._dir, 'commands');
        let files: string[];
        try { files = readdirSync(cmdDir).filter(f => f.endsWith('.js')); } catch { return; }

        const pluginId = (this.constructor as any).id;
        for (const file of files) {
            try {
                const filePath = path.join(cmdDir, file);
                const url = pathToFileURL(filePath).href + (process.env['NODE_ENV'] === 'development' ? '?t=' + Date.now() : '');
                const mod = await import(url);
                if (mod.default?.name) {
                    mod.default.pluginId = pluginId;
                    this.commands.set(mod.default.name, mod.default);
                    if (this.client.commands) {
                        this.client.commands.set(mod.default.name, mod.default);
                    }
                }
            } catch (err) {
                logger.error({ err, msg: `[Plugin] Failed to load command ${file}` });
            }
        }
    }

    _unloadCommands(): void {
        for (const [name] of this.commands) {
            this.client.commands?.delete(name);
        }
        this.commands.clear();
    }

    async _loadEvents(): Promise<void> {
        if (!this._dir) { return; }
        const { readdirSync } = await import('fs');
        const path = await import('path');
        const { pathToFileURL } = await import('url');

        const evtDir = path.join(this._dir, 'events');
        let files: string[];
        try { files = readdirSync(evtDir).filter(f => f.endsWith('.js')); } catch { return; }

        for (const file of files) {
            try {
                const filePath = path.join(evtDir, file);
                const url = pathToFileURL(filePath).href + (process.env['NODE_ENV'] === 'development' ? '?t=' + Date.now() : '');
                const mod = await import(url);
                if (!mod.default?.name || !mod.default.execute) { continue; }

                const { name, once, execute } = mod.default;
                const handler = (...args: unknown[]) => execute(...args, this.client);
                this.client[once ? 'once' : 'on'](name, handler);
                this.eventHandlers.push({ name, handler, once });
            } catch (err) {
                logger.error({ err, msg: `[Plugin] Failed to load event ${file}` });
            }
        }
    }

    _unloadEvents(): void {
        for (const { name, handler } of this.eventHandlers) {
            this.client.removeListener(name, handler);
        }
        this.eventHandlers = [];
    }

    _stopSchedulers(): void {
        for (const s of this.schedulers) {
            clearInterval(s);
            clearTimeout(s);
        }
        this.schedulers = [];
    }

    getCommands(): CommandModule[] {
        return [...this.commands.values()];
    }
}

export default Plugin;