import Plugin from '../../core/Plugin.js';
import { interlinkConfig } from './config.js';
import { getDb } from '../../db/knex.js';
import BotRegistry from './registry.js';
import MessageBus from './messageBus.js';
import RedisTransport from './redis.js';
import InterlinkServer from './server.js';
import { createLogger } from '../../utils/logger.js';

export default class InterlinkPlugin extends Plugin {
    const logger = createLogger({ component: 'plugin:interlink' });
    static id = 'interlink';
    static version = '1.0.0';
    static dependencies = [];

    async onEnable() {
        if (!interlinkConfig.enabled) {
            logger.info('[Interlink] Plugin is disabled (INTERLINK_ENABLED != true)');
            return;
        }

        const db = getDb();
        this._registry = new BotRegistry(db);

        this._messageBus = new MessageBus({
            registry: this._registry,
            config: interlinkConfig,
            eventBus: this.bus
        });

        this._httpServer = new InterlinkServer({
            registry: this._registry,
            messageBus: this._messageBus
        });
        await this._httpServer.start(interlinkConfig.httpPort);

        if (interlinkConfig.redis.host) {
            try {
                this._redisTransport = new RedisTransport(interlinkConfig.redis);
                await this._redisTransport.connect((envelope) => {
                    this._messageBus.handleIncomingMessage(envelope);
                });
                logger.info('[Interlink] Redis transport connected');
            } catch (err) {
                logger.warn('[Interlink] Redis transport unavailable (HTTP-only mode):', err.message);
            }
        }

        this._setupEventBridge();

        await this._loadCommands();

        logger.info('[Interlink] Plugin enabled');
    }

    async onDisable() {
        if (this._httpServer) {
            await this._httpServer.stop();
        }
        if (this._redisTransport) {
            await this._redisTransport.disconnect();
        }
        this._unloadCommands();
        this._teardownEventBridge();
        logger.info('[Interlink] Plugin disabled');
    }

    _setupEventBridge() {
        const events = interlinkConfig.forwardEvents;
        if (!events || events.length === 0) {return;}

        this._eventUnsubscribers = [];
        for (const eventName of events) {
            const unsub = this.bus.on(eventName, async(payload) => {
                try {
                    const bots = await this._registry.list();
                    for (const bot of bots) {
                        if (!bot.is_active) {continue;}
                        const envelope = this._messageBus.createEnvelope('event', bot.name, {
                            event: eventName,
                            data: payload
                        });
                        await this._messageBus._sendHttp(bot, envelope);
                    }
                } catch (err) {
                    logger.error(`[Interlink] Error forwarding event ${eventName}:`, err.message);
                }
            }, 'interlink');
            this._eventUnsubscribers.push(unsub);
        }
        logger.info(`[Interlink] Forwarding events: ${events.join(', ')}`);
    }

    _teardownEventBridge() {
        if (this._eventUnsubscribers) {
            for (const unsub of this._eventUnsubscribers) {
                try { unsub(); } catch {}
            }
            this._eventUnsubscribers = [];
        }
    }
}
