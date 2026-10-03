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
        this.manager.registerSocketHandler('admin.plugin.enable', async (client: unknown, args: unknown) => {
            const a = args as { id: string };
            await (client as { manager: { enablePlugin: (id: string) => Promise<void> } }).manager.enablePlugin(a.id);
            return { success: true, message: `Plugin "${a.id}" enabled` };
        });

        this.manager.registerSocketHandler('admin.plugin.disable', async (client: unknown, args: unknown) => {
            const a = args as { id: string };
            await (client as { manager: { disablePlugin: (id: string) => Promise<void> } }).manager.disablePlugin(a.id);
            return { success: true, message: `Plugin "${a.id}" disabled` };
        });

        this.manager.registerSocketHandler('admin.plugin.reload', async (client: unknown, args: unknown) => {
            const a = args as { id: string };
            await (client as { manager: { reloadPlugin: (id: string) => Promise<void> } }).manager.reloadPlugin(a.id);
            return { success: true, message: `Plugin "${a.id}" reloaded` };
        });

        this.manager.registerSocketHandler('admin.plugin.install', async (client: unknown, args: unknown) => {
            const a = args as { id: string };
            await (client as { manager: { installPlugin: (id: string) => Promise<void> } }).manager.installPlugin(a.id);
            return { success: true, message: `Plugin "${a.id}" installed` };
        });

        this.manager.registerSocketHandler('admin.plugin.uninstall', async (client: unknown, args: unknown) => {
            const a = args as { id: string };
            await (client as { manager: { uninstallPlugin: (id: string) => Promise<void> } }).manager.uninstallPlugin(a.id);
            return { success: true, message: `Plugin "${a.id}" uninstalled` };
        });

        this.manager.registerSocketHandler('admin.logging.set', (_client: unknown, args: unknown) => {
            const a = args as { setting: string; value: string };
            return Promise.resolve({ success: true, message: `Logging ${a.setting} set to ${a.value}` });
        });

        this.manager.registerSocketHandler('admin.locales.reload', async (_client: unknown, args: unknown) => {
            const rawLng = (args as { lng?: unknown }).lng;
            const rawNs = (args as { ns?: unknown }).ns;
            const lng = typeof rawLng === 'string' ? rawLng : undefined;
            const ns = typeof rawNs === 'string' ? rawNs : undefined;
            await i18n.reloadResources(lng, ns);
            return { success: true, message: 'Locales reloaded from disk' };
        });
    }
}