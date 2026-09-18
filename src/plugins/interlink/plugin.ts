import Plugin from '../../core/Plugin.js';
import { interlinkConfig } from './config.js';
import { getDb } from '../../db/knex.js';
import BotRegistry from './registry.js';
import MessageBus from './messageBus.js';
import RedisTransport from './redis.js';
import InterlinkServer from './server.js';
import { createLogger } from '../../utils/logger.js';
import { config } from '../../config/config.js';
import type { EventBusImpl } from '../../core/EventBus.js';

// Type definitions for Interlink components
interface Envelope {
    protocol: string;
    version: string;
    type: string;
    source: string;
    target: string;
    id: string;
    timestamp: number;
    nonce: string;
    payload: unknown;
}

interface PluginManagerRef {
    bus: EventBusImpl;
    registerSocketHandler(namespace: string, handler: (...args: any[]) => Promise<any>): void;
}

export default class InterlinkPlugin extends Plugin {
    static override id = 'interlink';
    static override version = '1.0.0';
    static override dependencies: string[] = [];

    public declare logger: ReturnType<typeof createLogger>;
    private _registry!: BotRegistry;
    private _messageBus!: MessageBus;
    private _httpServer!: InterlinkServer;
    private _redisTransport: RedisTransport | null = null;
    private _eventUnsubscribers: (() => void)[] = [];

    constructor(client: any, manager: PluginManagerRef) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:interlink' });
        this._redisTransport = null;
    }

    override async onEnable(): Promise<void> {
        if (!interlinkConfig.enabled) {
            this.logger.info('[Interlink] Plugin is disabled (INTERLINK_ENABLED != true)');
            return;
        }

        const db = getDb();
        this._registry = new BotRegistry(db);

        this._messageBus = new MessageBus({
            registry: this._registry,
            auth: null,
            redis: this._redisTransport,
            config: interlinkConfig,
            eventBus: this.bus
        });

        this._httpServer = new InterlinkServer({
            registry: this._registry,
            messageBus: this._messageBus,
            redis: this._redisTransport,
            config: config.interlink
        });
        await this._httpServer.start(interlinkConfig.httpPort);

        if (interlinkConfig.redis.host) {
            try {
                this._redisTransport = new RedisTransport(interlinkConfig.redis);
                await this._redisTransport.connect((envelope: unknown) => {
                    this._messageBus.handleIncomingMessage(envelope as Envelope);
                });
                this.logger.info('[Interlink] Redis transport connected');
            } catch (err) {
                this.logger.warn({ err: err as Error, msg: '[Interlink] Redis transport unavailable (HTTP-only mode)' });
            }
        }

        this._setupEventBridge();

        await this._loadCommands();

        this.logger.info('[Interlink] Plugin enabled');
    }

    override async onDisable(): Promise<void> {
        if (this._httpServer) {
            await this._httpServer.stop();
        }
        if (this._redisTransport) {
            await this._redisTransport.disconnect();
        }
        this._unloadCommands();
        this._teardownEventBridge();
        this.logger.info('[Interlink] Plugin disabled');
    }

    _setupEventBridge(): void {
        const events = interlinkConfig.forwardEvents;
        if (!events || events.length === 0) { return; }

        this._eventUnsubscribers = [];
        for (const eventName of events) {
            const unsub = this.bus.on(eventName, async (payload: unknown) => {
                try {
                    const bots = await this._registry.list();
                    for (const bot of bots) {
                        if (!bot.is_active) { continue; }
                        const envelope = this._messageBus.createEnvelope('event', bot.name, {
                            event: eventName,
                            data: payload
                        });
                        await this._messageBus._sendHttp(bot, envelope);
                    }
                } catch (err) {
                    this.logger.error({ err: err as Error, msg: `[Interlink] Error forwarding event ${eventName}` });
                }
            }, 'interlink');
            this._eventUnsubscribers.push(unsub);
        }
        this.logger.info(`[Interlink] Forwarding events: ${events.join(', ')}`);
    }

    _teardownEventBridge(): void {
        if (this._eventUnsubscribers) {
            for (const unsub of this._eventUnsubscribers) {
                try { unsub(); } catch {}
            }
            this._eventUnsubscribers = [];
        }
    }
}