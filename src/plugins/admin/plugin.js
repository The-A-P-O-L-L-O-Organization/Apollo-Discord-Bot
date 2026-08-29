import Plugin from '../../core/Plugin.js';
import { createLogger } from '../../utils/logger.js';

export default class AdminPlugin extends Plugin {
    constructor(client, manager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:admin' });
    }
  static id = 'admin';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    this._registerSocketHandlers();
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
  }

  _registerSocketHandlers() {
    this.manager.registerSocketHandler('admin.plugin.enable', async (client, args) => {
      await client.manager.enablePlugin(args.id);
      return { success: true, message: `Plugin "${args.id}" enabled` };
    });

    this.manager.registerSocketHandler('admin.plugin.disable', async (client, args) => {
      await client.manager.disablePlugin(args.id);
      return { success: true, message: `Plugin "${args.id}" disabled` };
    });

    this.manager.registerSocketHandler('admin.plugin.reload', async (client, args) => {
      await client.manager.reloadPlugin(args.id);
      return { success: true, message: `Plugin "${args.id}" reloaded` };
    });

    this.manager.registerSocketHandler('admin.plugin.install', async (client, args) => {
      await client.manager.installPlugin(args.id);
      return { success: true, message: `Plugin "${args.id}" installed` };
    });

    this.manager.registerSocketHandler('admin.plugin.uninstall', async (client, args) => {
      await client.manager.uninstallPlugin(args.id);
      return { success: true, message: `Plugin "${args.id}" uninstalled` };
    });

    this.manager.registerSocketHandler('admin.logging.set', async (client, args) => {
      return { success: true, message: `Logging ${args.setting} set to ${args.value}` };
    });
  }
}
