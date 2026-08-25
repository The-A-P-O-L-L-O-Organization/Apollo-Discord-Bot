import Plugin from '../../core/Plugin.js';
import { initIntegrationPoller, stopIntegrationPoller } from '../../utils/integrationPoller.js';
import { startWebhookServer, stopWebhookServer } from '../../utils/integrationWebhook.js';
import { createLogger } from '../../utils/logger.js';

export default class IntegrationsPlugin extends Plugin {
  static id = 'integrations';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    this._registerSocketHandlers();

    const cfg = this.client.config;
    initIntegrationPoller(this.client, cfg);

    if (cfg.integrations.webhookPort && cfg.integrations.githubSecret) {
      startWebhookServer(
        cfg.integrations.webhookPort,
        cfg.integrations.githubSecret,
        this.client
      );
    }
  }

  async onDisable() {
    this._unloadCommands();
    stopIntegrationPoller();
    stopWebhookServer();
  }

  _registerSocketHandlers() {
    this.manager.registerSocketHandler('integrations.add', async (client, args) => {
      return { success: true, message: `Integration added (type: ${args.type})` };
    });

    this.manager.registerSocketHandler('integrations.remove', async (client, args) => {
      return { success: true, message: `Integration ${args.id} removed` };
    });
  }
}
