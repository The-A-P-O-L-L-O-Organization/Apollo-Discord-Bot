import Plugin from '../../core/Plugin.js';
import { startSlaMonitor } from './events/slaMonitor.js';
import { createLogger } from '../../utils/logger.js';

export default class TicketsPlugin extends Plugin {
    constructor(client, manager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:tickets' });
    }
  static id = 'tickets';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    this._registerSocketHandlers();
    
    // Start SLA monitor
    startSlaMonitor(this.client);
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
    this._stopSchedulers();
  }

  _registerSocketHandlers() {
    this.manager.registerSocketHandler('tickets.create', async (client, args) => {
      return { success: true, message: `Ticket created for user ${args.user}` };
    });

    this.manager.registerSocketHandler('tickets.close', async (client, args) => {
      return { success: true, message: `Ticket ${args.id} closed` };
    });

    this.manager.registerSocketHandler('tickets.add', async (client, args) => {
      return { success: true, message: `User ${args.user} added to ticket ${args.id}` };
    });

    this.manager.registerSocketHandler('tickets.remove', async (client, args) => {
      return { success: true, message: `User ${args.user} removed from ticket ${args.id}` };
    });
  }
}
