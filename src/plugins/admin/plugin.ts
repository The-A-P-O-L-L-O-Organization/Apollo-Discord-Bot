import { Plugin } from '../../core/Plugin.js';
import type PluginManager from '../../core/PluginManager.js';
import type { Client } from 'discord.js';
import { createLogger } from '../../utils/logger.js';
import { i18n } from '../../i18n/index.js';

export default class AdminPlugin extends Plugin {
    public declare logger: ReturnType<typeof createLogger>;

    constructor(client: Client, manager: PluginManager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:admin' });
    }

    static override get id() { return 'admin'; }
    static override readonly version = '1.0.0';
    static override readonly dependencies: string[] = [];

    override async onEnable() {
        await this._loadCommands();
        await this._loadEvents();
        this._registerSocketHandlers();
    }

    override onDisable(): Promise<void> {
        this._unloadCommands();
        this._unloadEvents();
        return Promise.resolve();
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

        this.manager.registerSocketHandler('admin.logging.set', (_client: any, args: any) => {
            return Promise.resolve({ success: true, message: `Logging ${args.setting} set to ${args.value}` });
        });

        this.manager.registerSocketHandler('admin.locales.reload', async (_client: any, args: any) => {
            const rawLng: unknown = args?.lng;
            const rawNs: unknown = args?.ns;
            const lng = typeof rawLng === 'string' ? rawLng : undefined;
            const ns = typeof rawNs === 'string' ? rawNs : undefined;
            await i18n.reloadResources(lng, ns);
            return { success: true, message: 'Locales reloaded from disk' };
        });
    }
}