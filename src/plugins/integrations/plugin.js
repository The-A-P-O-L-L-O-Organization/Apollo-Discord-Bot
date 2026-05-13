import Plugin from '../../core/Plugin.js';
import { initIntegrationPoller, stopIntegrationPoller } from '../../utils/integrationPoller.js';
import { startWebhookServer, stopWebhookServer } from '../../utils/integrationWebhook.js';

export default class IntegrationsPlugin extends Plugin {
  static id = 'integrations';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();

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
}
