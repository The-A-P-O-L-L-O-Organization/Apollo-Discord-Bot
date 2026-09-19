import { createRedisClient, closeRedisClient } from '../../utils/redis.js';
import { logger } from '../../utils/logger.js';
import type { Redis as RedisType } from 'ioredis';
import type { Envelope } from './messageBus.js';

export default class RedisTransport {
    channelPrefix: string;
    _messageChannel: string;
    _responseChannelPrefix: string;
    _config: { channelPrefix?: string };
    _pub: RedisType | null;
    _sub: RedisType | null;
    _messageHandler: ((data: unknown) => void) | null;
    isConnected: boolean;

    constructor(config: { channelPrefix?: string }) {
        this.channelPrefix = config.channelPrefix ?? 'apollo:interlink';
        this._messageChannel = `${this.channelPrefix}:message`;
        this._responseChannelPrefix = `${this.channelPrefix}:response`;
        this._config = config;
        this._pub = null;
        this._sub = null;
        this._messageHandler = null;
        this.isConnected = false;
    }

    _responseChannel(botId: string): string {
        return `${this._responseChannelPrefix}:${botId}`;
    }

    async connect(onMessage: (data: unknown) => void): Promise<void> {
        this._pub = createRedisClient('interlink-pub');
        this._sub = createRedisClient('interlink-sub');
        await this._pub.connect();
        await this._sub.connect();
        this._messageHandler = onMessage;

        await new Promise((resolve, reject) => {
            this._sub!.on('ready', resolve);
            this._sub!.on('error', reject);
        });

        await this._sub.subscribe(this._messageChannel);
        this._sub.on('message', (channel: string, message: string) => {
            if (channel === this._messageChannel && this._messageHandler) {
                try {
                    const data: unknown = JSON.parse(message);
                    this._messageHandler(data);
                } catch (err: unknown) {
                    logger.error({ err: err as Error, msg: '[Interlink:Redis] Failed to parse message' });
                }
            }
        });

        this.isConnected = true;
    }

    publishResponse(botId: string, envelope: Envelope): void {
        if (!this._pub) { return; }
        const channel = this._responseChannel(botId);
        this._pub.publish(channel, JSON.stringify(envelope)).catch((err: unknown) => {
            logger.error({ err: err as Error, msg: '[Interlink:Redis] Failed to publish response' });
        });
    }

    async disconnect(): Promise<void> {
        this.isConnected = false;
        if (this._sub) {
            await this._sub.unsubscribe(this._messageChannel);
        }
        if (this._pub) {
            await closeRedisClient(this._pub ?? undefined);
            this._pub = null;
        }
        if (this._sub) {
            await closeRedisClient(this._sub ?? undefined);
            this._sub = null;
        }
    }
}