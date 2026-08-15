Responsibility
The integrations plugin manages external service integrations, providing polling and webhook handling for third-party services.

Design
Extends the base Plugin class. Uses initIntegrationPoller and stopIntegrationPoller for periodic polling. Uses startWebhookServer and stopWebhookServer for HTTP webhook endpoints. Registers socket handlers for 'integrations.add' and 'integrations.remove' events.

Flow
onEnable: loads commands, registers socket handlers, initializes integration poller with client config, conditionally starts webhook server if webhookPort and githubSecret are configured.
onDisable: unloads commands, stops integration poller, stops webhook server.
Socket handlers: 'integrations.add' returns success message with integration type; 'integrations.remove' returns success message with integration id.

Integration
Dependencies: core/Plugin, utils/integrationPoller, utils/integrationWebhook.
Consumed by: socket events 'integrations.add' and 'integrations.remove'; command files in src/plugins/integrations/commands/.