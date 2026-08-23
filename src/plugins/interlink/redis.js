import { getRedis } from '../../utils/redis.js';
import { logger } from '../../utils/logger.js';

export default class RedisTransport {
    constructor(config) {
        this.channelPrefix = config.channelPrefix || 'apollo:interlink';
        this._messageChannel = `${this.channelPrefix}:message`;
        this._responseChannelPrefix = `${this.channelPrefix}:response`;
        this._config = config;
        this._pub = null;
        this._sub = null;
        this._messageHandler = null;
        this.isConnected = false;
    }

    _responseChannel(botId) {
        return `${this._responseChannelPrefix}:${botId}`;
    }

    async connect(onMessage) {
        this._pub = getRedis('interlink-pub');
        this._sub = getRedis('interlink-sub');
        await this._pub.connect();
        await this._sub.connect();
        this._messageHandler = onMessage;

        await new Promise((resolve, reject) => {
            this._sub.on('ready', resolve);
            this._sub.on('error', reject);
        });

        await this._sub.subscribe(this._messageChannel);
        this._sub.on('message', (channel, message) => {
            if (channel === this._messageChannel && this._messageHandler) {
                try {
                    const data = JSON.parse(message);
                    this._messageHandler(data);
                } catch (err) {
                    logger.error('[Interlink:Redis] Failed to parse message:', err.message);
                }
            }
        });

        this.isConnected = true;
    }

    publishResponse(botId, envelope) {
        if (!this._pub) {return;}
        const channel = this._responseChannel(botId);
        this._pub.publish(channel, JSON.stringify(envelope)).catch(err => {
            logger.error('[Interlink:Redis] Failed to publish response:', err.message);
        });
    }

    async disconnect() {
        this.isConnected = false;
        if (this._sub) {
            await this._sub.unsubscribe(this._messageChannel);
        }
        // Don't disconnect - shared connections managed by redis.js
        this._pub = null;
        this._sub = null;
    }
}
