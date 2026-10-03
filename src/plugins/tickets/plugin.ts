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
        this.manager.registerSocketHandler('tickets.create', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, { user: string }];
            return Promise.resolve({ success: true, message: `Ticket created for user ${argsObj.user}` });
        });

        this.manager.registerSocketHandler('tickets.close', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, { id: string }];
            return Promise.resolve({ success: true, message: `Ticket ${argsObj.id} closed` });
        });

        this.manager.registerSocketHandler('tickets.add', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, { user: string; id: string }];
            return Promise.resolve({ success: true, message: `User ${argsObj.user} added to ticket ${argsObj.id}` });
        });

        this.manager.registerSocketHandler('tickets.remove', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, { user: string; id: string }];
            return Promise.resolve({ success: true, message: `User ${argsObj.user} removed from ticket ${argsObj.id}` });
        });
    }
}