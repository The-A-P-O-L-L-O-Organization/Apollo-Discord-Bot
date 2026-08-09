import crypto from 'crypto';
import { safeFetch } from '../../utils/safeFetch.js';

const VALID_TYPES = new Set(['ping', 'pong', 'command', 'event', 'custom']);

export default class MessageBus {
    constructor({ registry, auth, redis, config, eventBus }) {
        this._registry = registry;
        this._auth = auth;
        this._redis = redis;
        this._config = config;
        this.eventBus = eventBus;
    }

    createEnvelope(type, target, payload) {
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
            payload
        };
    }

    async send(botName, type, payload) {
        const bot = await this._registry.get(botName);
        if (!bot) {
            return { success: false, error: `Unknown bot: ${botName}` };
        }
        const envelope = this.createEnvelope(type, botName, payload);
        return this._sendHttp(bot, envelope);
    }

    async broadcast(type, payload) {
        const bots = await this._registry.list();
        const active = bots.filter(b => b.is_active);
        const results = [];
        for (const bot of active) {
            const envelope = this.createEnvelope(type, bot.name, payload);
            const result = await this._sendHttp(bot, envelope);
            results.push({ name: bot.name, ...result });
        }
        return results;
    }

    async handleIncomingMessage(envelope, sendResponse) {
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
            return;
        }

        if (this.eventBus) {
            this.eventBus.emit(`interlink:message:${envelope.type}`, envelope);
        }

        if (this._redis && envelope.target === 'apollo') {
            this._redis.publishResponse(envelope.source, envelope);
        }
    }

    async _sendHttp(bot, envelope) {
        const url = bot.webhook_url;
        const timeout = this._config.requestTimeout || 5000;
        const maxRetries = this._config.maxRetries || 3;
        const payload = JSON.stringify(envelope);

        const fetchImpl = async (targetUrl, opts) => {
            return fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                signal: opts.signal
            });
        };

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await safeFetch(url, { timeoutMs: timeout, fetchImpl, skipDnsCheck: false });
                return { success: true, status: 200 };
            } catch (err) {
                const msg = err.message || String(err);
                const httpMatch = msg.match(/^Fetch failed: (\d{3})/);
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
    }
}
