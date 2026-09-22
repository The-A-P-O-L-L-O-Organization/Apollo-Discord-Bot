import { randomUUID } from 'node:crypto';
import Plugin from '../../core/Plugin.js';
import type { TypedClient } from '../../core/Plugin.js';
import { generateNonce, getInterlinkClient, resetInterlinkClient } from './connectClient.js';
import type { InterlinkConnectClient } from './connectClient.js';
import type { Envelope as ProtoEnvelope } from '../../generated/interlink/interlink/v1/interlink_pb.js';
import { createLogger } from '../../utils/logger.js';
import { config } from '../../config/config.js';
import type { EventBusImpl } from '../../core/EventBus.js';

// Trust model: the shared INTERLINK_AUTH_KEY defines the full trust domain.
// Any key holder can assert any bot identity (per-bot source is self-asserted).
// Delivery is at-most-once: Send Accepted:true means accepted by the Go
// service, even when the target is offline (no redelivery).

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
    registerSocketHandler(namespace: string, handler: (...args: unknown[]) => Promise<unknown>): void;
}

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_FAILURES_BEFORE_REREGISTER = 3;
const LISTENER_BASE_BACKOFF_MS = 1000;
const LISTENER_MAX_BACKOFF_MS = 30000;
const MIN_AUTH_KEY_LENGTH = 32;

function forwardEvents(): string[] {
    return (process.env['INTERLINK_FORWARD_EVENTS'] ?? 'memberJoin,guildBanAdd').split(',').filter(Boolean);
}

function decodeConnectPayload(payload: Uint8Array): unknown {
    if (payload.length === 0) { return null; }
    try {
        return JSON.parse(Buffer.from(payload).toString('utf8'));
    } catch {
        return payload;
    }
}

function encodeConnectPayload(payload: unknown): Uint8Array<ArrayBuffer> {
    if (payload instanceof Uint8Array) { return Uint8Array.from(payload); }
    if (typeof payload === 'string') { return new TextEncoder().encode(payload); }
    return new TextEncoder().encode(JSON.stringify(payload ?? null));
}

function toLegacyEnvelope(envelope: ProtoEnvelope): Envelope {
    return {
        protocol: envelope.protocol,
        version: envelope.version,
        type: envelope.type,
        source: envelope.source,
        target: envelope.target,
        id: envelope.id,
        timestamp: Number(envelope.timestamp),
        nonce: envelope.nonce,
        payload: decodeConnectPayload(envelope.payload)
    };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export default class InterlinkPlugin extends Plugin {
    static override id = 'interlink';
    static override version = '2.0.0';
    static override dependencies: string[] = [];

    public declare logger: ReturnType<typeof createLogger>;
    private _connectClient: InterlinkConnectClient | null = null;
    private _connectHeartbeat: NodeJS.Timeout | null = null;
    private _connectAbort: AbortController | null = null;
    private _connectBotId = '';
    private _heartbeatFailures = 0;
    private _eventUnsubscribers: (() => void)[] = [];

    constructor(client: TypedClient, manager: PluginManagerRef) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:interlink' });
    }

    override async onEnable(): Promise<void> {
        if (!config.interlink.enabled) {
            this.logger.info('[Interlink] Plugin is disabled (INTERLINK_ENABLED != true)');
            return;
        }

        await this._startConnectBridge();
        this._setupEventBridge();
        await this._loadCommands();
        this.logger.info('[Interlink] Plugin enabled (Connect-only)');
    }

    override async onDisable(): Promise<void> {
        await this._stopConnectBridge();
        this._unloadCommands();
        this._teardownEventBridge();
        this.logger.info('[Interlink] Plugin disabled');
    }

    async _startConnectBridge(): Promise<void> {
        const authKey = config.interlink.authKey;
        if (!authKey) {
            this.logger.warn('[Interlink] Connect bridge disabled: INTERLINK_AUTH_KEY is not set. Set a shared secret (min 32 chars) in .env to enable cross-bot RPC.');
            return;
        }
        if (authKey.length < MIN_AUTH_KEY_LENGTH) {
            this.logger.warn(`[Interlink] INTERLINK_AUTH_KEY is only ${authKey.length} chars (recommended min ${MIN_AUTH_KEY_LENGTH}). Anyone holding this key is fully trusted.`);
        }
        const botId = config.discord.clientId || 'apollo';
        resetInterlinkClient();
        const client = getInterlinkClient({
            baseUrl: config.interlink.grpcAddress,
            botId,
            authKey
        });
        try {
            await client.registerBot({
                botId,
                publicKey: config.interlink.publicKey,
                endpoint: config.interlink.grpcAddress,
                capabilities: { commands: 'true', events: 'true' },
                maxConcurrentStreams: 100
            });
        } catch (err) {
            this.logger.warn({ err: err as Error, msg: '[Interlink] Connect bridge unavailable (registration failed)' });
            return;
        }
        this._connectClient = client;
        this._connectBotId = botId;
        this._heartbeatFailures = 0;
        this._connectHeartbeat = setInterval(() => {
            void this._sendHeartbeat(client, botId);
        }, HEARTBEAT_INTERVAL_MS);
        if (typeof this._connectHeartbeat.unref === 'function') {
            this._connectHeartbeat.unref();
        }
        const abort = new AbortController();
        this._connectAbort = abort;
        void this._runConnectListener(client, botId, abort.signal);
        this.logger.info('[Interlink] Connect bridge enabled');
    }

    async _sendHeartbeat(client: InterlinkConnectClient, botId: string): Promise<void> {
        try {
            await client.heartbeat({ botId, timestamp: BigInt(Date.now()) });
            this._heartbeatFailures = 0;
        } catch (err) {
            this._heartbeatFailures += 1;
            this.logger.warn({ err: err as Error, msg: '[Interlink] Connect heartbeat failed' });
            if (this._heartbeatFailures >= HEARTBEAT_FAILURES_BEFORE_REREGISTER) {
                this._heartbeatFailures = 0;
                try {
                    await client.registerBot({
                        botId,
                        publicKey: config.interlink.publicKey,
                        endpoint: config.interlink.grpcAddress,
                        capabilities: { commands: 'true', events: 'true' },
                        maxConcurrentStreams: 100
                    });
                    this.logger.info('[Interlink] Re-registered after repeated heartbeat failures');
                } catch (registerErr) {
                    this.logger.warn({ err: registerErr as Error, msg: '[Interlink] Re-registration failed' });
                }
            }
        }
    }

    async _runConnectListener(client: InterlinkConnectClient, botId: string, signal: AbortSignal): Promise<void> {
        let attempt = 0;
        while (!signal.aborted) {
            try {
                for await (const envelope of client.subscribe(botId)) {
                    if (signal.aborted) { return; }
                    attempt = 0;
                    await this._handleIncomingEnvelope(toLegacyEnvelope(envelope));
                }
                if (signal.aborted) { return; }
                this.logger.warn('[Interlink] Connect subscription ended, reconnecting');
            } catch (err) {
                if (signal.aborted) { return; }
                this.logger.warn({ err: err as Error, msg: '[Interlink] Connect subscription error, reconnecting with backoff' });
            }
            attempt += 1;
            const delay = Math.min(LISTENER_BASE_BACKOFF_MS * 2 ** (attempt - 1), LISTENER_MAX_BACKOFF_MS);
            await sleep(delay, signal);
        }
    }

    async _handleIncomingEnvelope(envelope: Envelope): Promise<void> {
        if (envelope.type === 'ping') {
            await this._sendViaConnect({
                protocol: 'apollo.interlink.v1',
                version: '1.0',
                type: 'pong',
                source: this._connectBotId,
                target: envelope.source,
                id: randomUUID(),
                timestamp: Date.now(),
                nonce: generateNonce(),
                payload: { status: 'ok', uptime: process.uptime() }
            });
            await this.bus.emit('interlink:message:ping', envelope);
            return;
        }
        await this.bus.emit(`interlink:message:${envelope.type}`, envelope);
    }

    async _stopConnectBridge(): Promise<void> {
        if (this._connectHeartbeat) {
            clearInterval(this._connectHeartbeat);
            this._connectHeartbeat = null;
        }
        if (this._connectAbort) {
            this._connectAbort.abort();
            this._connectAbort = null;
        }
        const client = this._connectClient;
        this._connectClient = null;
        if (client && this._connectBotId) {
            try {
                await client.unregisterBot(this._connectBotId);
            } catch (err) {
                this.logger.warn({ err: err as Error, msg: '[Interlink] Connect unregister failed' });
            }
        }
        this._connectBotId = '';
        this._heartbeatFailures = 0;
        resetInterlinkClient();
    }

    async _sendViaConnect(envelope: Envelope): Promise<boolean> {
        const client = this._connectClient;
        if (!client) { return false; }
        try {
            await client.send({
                protocol: 'apollo.interlink.v1',
                version: '1.0',
                type: envelope.type,
                source: envelope.source,
                target: envelope.target,
                id: envelope.id,
                timestamp: BigInt(envelope.timestamp),
                nonce: envelope.nonce,
                payload: encodeConnectPayload(envelope.payload)
            });
            return true;
        } catch (err) {
            this.logger.warn({ err: err as Error, msg: '[Interlink] Connect send failed (at-most-once delivery, message dropped)' });
            return false;
        }
    }

    _setupEventBridge(): void {
        const events = forwardEvents();
        if (!events || events.length === 0) { return; }

        this._eventUnsubscribers = [];
        for (const eventName of events) {
            const unsub = this.bus.on(eventName, async (payload: unknown) => {
                try {
                    const client = this._connectClient;
                    if (!client) { return; }
                    const listing = await client.listBots();
                    for (const bot of listing.bots) {
                        if (!bot.online || bot.botId === this._connectBotId) { continue; }
                        await this._sendViaConnect({
                            protocol: 'apollo.interlink.v1',
                            version: '1.0',
                            type: 'event',
                            source: this._connectBotId,
                            target: bot.botId,
                            id: randomUUID(),
                            timestamp: Date.now(),
                            nonce: generateNonce(),
                            payload: { event: eventName, data: payload }
                        });
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
