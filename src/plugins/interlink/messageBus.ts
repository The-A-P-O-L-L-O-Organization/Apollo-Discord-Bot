import crypto from 'crypto';
import { ReplayProtection } from './replayProtection.js';
import type { BotRecord } from './registry.js';

const VALID_TYPES = new Set(['ping', 'pong', 'command', 'event', 'custom']);

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

interface SendResult {
    success: boolean;
    status?: number;
    error?: string;
}

interface BroadcastResult {
    name: string;
    success: boolean;
    status?: number;
    error?: string;
}

interface InterlinkConfig {
    requestTimeout?: number;
    maxRetries?: number;
    [key: string]: unknown;
}

export default class MessageBus {
    _registry: {
        list(): Promise<BotRecord[]>;
        get(name: string): Promise<BotRecord | null>;
    };
    _auth: unknown;
    _redis: {
        publishResponse(botId: string, envelope: Envelope): void;
    } | null;
    _config: InterlinkConfig;
    eventBus: {
        emit(event: string, ...args: unknown[]): void;
    } | null;

    constructor({ registry, auth, redis, config, eventBus }: {
        registry: {
            list(): Promise<BotRecord[]>;
            get(name: string): Promise<BotRecord | null>;
        };
        auth: unknown;
        redis: {
            publishResponse(botId: string, envelope: Envelope): void;
        } | null;
        config: InterlinkConfig;
        eventBus: {
            emit(event: string, ...args: unknown[]): void;
        } | null;
    }) {
        this._registry = registry;
        this._auth = auth;
        this._redis = redis;
        this._config = config;
        this.eventBus = eventBus;
    }

    createEnvelope(type: string, target: string, payload: unknown): Envelope {
        if (!VALID_TYPES.has(type)) {
            throw new Error(`Invalid message type: ${type}. Valid types: ${[...VALID_TYPES].join(', ')}`);
        }
        return {
            protocol: 'interlink',
            version: '1',
            type,
            source: 'apollo',
            target,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            nonce: ReplayProtection.generateNonce(),
            payload
        };
    }

    async send(botName: string, type: string, payload: unknown): Promise<SendResult> {
        const bot = await this._registry.get(botName);
        if (!bot) {
            return { success: false, error: `Unknown bot: ${botName}` };
        }
        const envelope = this.createEnvelope(type, botName, payload);
        return this._sendHttp(bot, envelope);
    }

    async broadcast(type: string, payload: unknown): Promise<BroadcastResult[]> {
        const bots = await this._registry.list();
        const active = bots.filter((b: BotRecord) => b.is_active);
        const results: BroadcastResult[] = [];
        for (const bot of active) {
            const envelope = this.createEnvelope(type, bot.name, payload);
            const result = await this._sendHttp(bot, envelope);
            results.push({ name: bot.name, ...result });
        }
        return results;
    }

    handleIncomingMessage(envelope: Envelope, sendResponse?: (resp: Envelope) => void): Promise<void> {
        if (envelope.type === 'ping') {
            const pong = this.createEnvelope('pong', envelope.source, {
                status: 'ok',
                uptime: process.uptime()
            });
            if (sendResponse) {
                sendResponse(pong);
            }
            if (this.eventBus) {
                this.eventBus.emit('interlink:message:ping', envelope);
            }
            return Promise.resolve();
        }

        if (this.eventBus) {
            this.eventBus.emit(`interlink:message:${envelope.type}`, envelope);
        }

        if (this._redis && envelope.target === 'apollo') {
            this._redis.publishResponse(envelope.source, envelope);
        }
        return Promise.resolve();
    }

    async _sendHttp(bot: BotRecord, envelope: Envelope): Promise<SendResult> {
        const url = bot.webhook_url;
        const timeout = this._config.requestTimeout ?? 5000;
        const maxRetries = this._config.maxRetries ?? 3;
        const payload = JSON.stringify(envelope);

        const fetchImpl = async (targetUrl: string | URL | Request, init?: RequestInit) => {
            return fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                ...init
            });
        };

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                try {
                    await fetchImpl(url, { signal: controller.signal });
                    return { success: true, status: 200 };
                } finally {
                    clearTimeout(timeoutId);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const httpMatch = /^Fetch failed: (\d{3})/.exec(msg);
                if (httpMatch) {
                    return { success: false, status: Number(httpMatch[1]), error: `HTTP ${httpMatch[1]}` };
                }
                if (msg.includes('Only HTTPS URLs are allowed.') || msg.includes('resolves to a private/internal address')) {
                    return { success: false, error: msg };
                }
                if (attempt === maxRetries) {
                    return { success: false, error: msg };
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        // Should never reach here due to loop structure, but TypeScript needs it
        return { success: false, error: 'Max retries exceeded' };
    }
}