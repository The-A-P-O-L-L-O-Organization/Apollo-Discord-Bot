import { Plugin } from '../../core/Plugin.js';
import { createLogger } from '../../utils/logger.js';

export default class AdminPlugin extends Plugin {
    public declare logger: ReturnType<typeof createLogger>;

    constructor(client: any, manager: any) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:admin' });
    }

    static override get id() { return 'admin'; }
    static override get version() { return '1.0.0'; }
    static override get dependencies() { return []; }

    override async onEnable() {
        await this._loadCommands();
        await this._loadEvents();
        this._registerSocketHandlers();
    }

    override async onDisable() {
        this._unloadCommands();
        this._unloadEvents();
    }

    _registerSocketHandlers() {
        this.manager.registerSocketHandler('admin.plugin.enable', async (client: any, args: any) => {
            await client.manager.enablePlugin(args.id);
            return { success: true, message: `Plugin "${args.id}" enabled` };
        });

        this.manager.registerSocketHandler('admin.plugin.disable', async (client: any, args: any) => {
            await client.manager.disablePlugin(args.id);
            return { success: true, message: `Plugin "${args.id}" disabled` };
        });

        this.manager.registerSocketHandler('admin.plugin.reload', async (client: any, args: any) => {
            await client.manager.reloadPlugin(args.id);
            return { success: true, message: `Plugin "${args.id}" reloaded` };
        });

        this.manager.registerSocketHandler('admin.plugin.install', async (client: any, args: any) => {
            await client.manager.installPlugin(args.id);
            return { success: true, message: `Plugin "${args.id}" installed` };
        });

        this.manager.registerSocketHandler('admin.plugin.uninstall', async (client: any, args: any) => {
            await client.manager.uninstallPlugin(args.id);
            return { success: true, message: `Plugin "${args.id}" uninstalled` };
        });

        this.manager.registerSocketHandler('admin.logging.set', async (_client: any, args: any) => {
            return { success: true, message: `Logging ${args.setting} set to ${args.value}` };
        });
    }
}