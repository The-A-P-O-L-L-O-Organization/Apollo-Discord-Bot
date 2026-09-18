import Plugin from '../../core/Plugin.js';
import type PluginManager from '../../core/PluginManager.js';
import type { Client } from 'discord.js';
import { startSlaMonitor } from './events/slaMonitor.js';
import { createLogger } from '../../utils/logger.js';

export default class TicketsPlugin extends Plugin {
    public declare logger: ReturnType<typeof createLogger>;

    constructor(client: Client, manager: PluginManager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:tickets' });
    }

    static override id = 'tickets';
    static override version = '1.0.0';
    static override dependencies = [];

    override async onEnable(): Promise<void> {
        await this._loadCommands();
        await this._loadEvents();
        this._registerSocketHandlers();

        // Start SLA monitor
        startSlaMonitor(this.client);
    }

    override onDisable(): Promise<void> {
        this._unloadCommands();
        this._unloadEvents();
        this._stopSchedulers();
        return Promise.resolve();
    }

    _registerSocketHandlers(): void {
        this.manager.registerSocketHandler('tickets.create', (client: any, args: any) => {
            return Promise.resolve({ success: true, message: `Ticket created for user ${args.user}` });
        });

        this.manager.registerSocketHandler('tickets.close', (client: any, args: any) => {
            return Promise.resolve({ success: true, message: `Ticket ${args.id} closed` });
        });

        this.manager.registerSocketHandler('tickets.add', (client: any, args: any) => {
            return Promise.resolve({ success: true, message: `User ${args.user} added to ticket ${args.id}` });
        });

        this.manager.registerSocketHandler('tickets.remove', (client: any, args: any) => {
            return Promise.resolve({ success: true, message: `User ${args.user} removed from ticket ${args.id}` });
        });
    }
}