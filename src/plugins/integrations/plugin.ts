import Plugin from '../../core/Plugin.js';
import type PluginManager from '../../core/PluginManager.js';
import type { Client } from 'discord.js';
import { initIntegrationPoller, stopIntegrationPoller } from '../../utils/integrationPoller.js';
import type { IntegrationConfig } from '../../utils/integrationPoller.js';
import { startWebhookServer, stopWebhookServer } from '../../utils/integrationWebhook.js';
import { createLogger } from '../../utils/logger.js';

export default class IntegrationsPlugin extends Plugin {
    static override id = 'integrations';
    static override version = '1.0.0';
    static override dependencies: string[] = [];

    public declare logger: any;

    constructor(client: Client, manager: PluginManager) {
        super(client, manager);
        // @ts-expect-error - pino logger type signature
        this.logger = createLogger('integrations');
    }

    override async onEnable(): Promise<void> {
        await this._loadCommands();
        this._registerSocketHandlers();

        const cfg = (this.client as any).config;
        initIntegrationPoller(this.client, cfg as { integrations: IntegrationConfig });

        const webhookCfg = cfg?.integrations as { webhookPort?: number; githubSecret?: string } | undefined;
        if (webhookCfg?.webhookPort && webhookCfg?.githubSecret) {
            await startWebhookServer(
                webhookCfg.webhookPort,
                webhookCfg.githubSecret,
                this.client
            );
        }
    }

    override onDisable(): Promise<void> {
        this._unloadCommands();
        stopIntegrationPoller();
        stopWebhookServer();
        return Promise.resolve();
    }

    _registerSocketHandlers(): void {
        this.manager.registerSocketHandler('integrations.add', (_client: any, args: any) => {
            return Promise.resolve({ success: true, message: `Integration added (type: ${args.type})` });
        });

        this.manager.registerSocketHandler('integrations.remove', (_client: any, args: any) => {
            return Promise.resolve({ success: true, message: `Integration ${args.id} removed` });
        });
    }
}