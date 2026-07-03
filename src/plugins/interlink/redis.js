import Redis from 'ioredis';

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
        const opts = {
            host: this._config.host || 'localhost',
            port: this._config.port || 6379
        };
        if (this._config.password) {
            opts.password = this._config.password;
        }

        this._pub = new Redis(opts);
        this._sub = new Redis(opts);
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
                    console.error('[Interlink:Redis] Failed to parse message:', err.message);
                }
            }
        });

        this.isConnected = true;
    }

    publishResponse(botId, envelope) {
        if (!this._pub) return;
        const channel = this._responseChannel(botId);
        this._pub.publish(channel, JSON.stringify(envelope)).catch(err => {
            console.error('[Interlink:Redis] Failed to publish response:', err.message);
        });
    }

    async disconnect() {
        this.isConnected = false;
        if (this._sub) {
            await this._sub.unsubscribe(this._messageChannel);
            this._sub.disconnect();
        }
        if (this._pub) {
            this._pub.disconnect();
        }
        this._pub = null;
        this._sub = null;
    }
}
