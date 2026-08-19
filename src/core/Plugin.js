/* eslint-disable no-console */
import { readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export default class Plugin {
    constructor(client, manager) {
        if (this.constructor === Plugin) {
            throw new Error('Plugin is abstract; create a subclass that defines static id');
        }
        this.client = client;
        this.manager = manager;
        this.bus = manager.bus;
        this.commands = new Map();
        this.eventHandlers = [];
        this.schedulers = [];
        this._loaded = false;
        this._enabled = false;
        this._dir = null;
    }

    static get id() {
        if (this === Plugin) {throw new Error('Plugin subclasses must override static id');}
        throw new Error(`Plugin class "${this.name}" must override static get id()`);
    }

    static get dependencies() { return []; }
    static get version() { return '1.0.0'; }
    
    // Optional: Discord intents and partials required by this plugin
    static get requiredIntents() { return []; }
    static get requiredPartials() { return []; }

    async onLoad() {}
    async onUnload() {}
    async onEnable() {}
    async onDisable() {}

    setDirectory(dir) { this._dir = dir; }

    async _loadCommands() {
        if (!this._dir) {return;}
        const cmdDir = path.join(this._dir, 'commands');
        let files;
        try { files = readdirSync(cmdDir).filter(f => f.endsWith('.js')); } catch { return; }

        const pluginId = this.constructor.id;
        for (const file of files) {
            try {
                const filePath = path.join(cmdDir, file);
                const url = pathToFileURL(filePath).href + (process.env.NODE_ENV === 'development' ? '?t=' + Date.now() : '');
                const mod = await import(url);
                if (mod.default && mod.default.name) {
                    mod.default.pluginId = pluginId;
                    this.commands.set(mod.default.name, mod.default);
                    if (this.client.commands) {
                        this.client.commands.set(mod.default.name, mod.default);
                    }
                }
            } catch (err) {
                console.error(`[Plugin] Failed to load command ${file}:`, err.message);
            }
        }
    }

    _unloadCommands() {
        for (const [name] of this.commands) {
            this.client.commands.delete(name);
        }
        this.commands.clear();
    }

    async _loadEvents() {
        if (!this._dir) {return;}
        const evtDir = path.join(this._dir, 'events');
        let files;
        try { files = readdirSync(evtDir).filter(f => f.endsWith('.js')); } catch { return; }

        for (const file of files) {
            try {
                const filePath = path.join(evtDir, file);
                const url = pathToFileURL(filePath).href + (process.env.NODE_ENV === 'development' ? '?t=' + Date.now() : '');
                const mod = await import(url);
                if (!mod.default || !mod.default.name || !mod.default.execute) {continue;}

                const { name, once, execute } = mod.default;
                const handler = (...args) => execute(...args, this.client);
                this.client[once ? 'once' : 'on'](name, handler);
                this.eventHandlers.push({ name, handler, once });
            } catch (err) {
                console.error(`[Plugin] Failed to load event ${file}:`, err.message);
            }
        }
    }

    _unloadEvents() {
        for (const { name, handler } of this.eventHandlers) {
            this.client.removeListener(name, handler);
        }
        this.eventHandlers = [];
    }

    _stopSchedulers() {
        for (const s of this.schedulers) {
            clearInterval(s);
            clearTimeout(s);
        }
        this.schedulers = [];
    }
}
