import express from 'express';
import createRoutes from './routes.js';
import RateLimiter from './rateLimit.js';

const DEFAULT_LIMIT = Number(process.env.INTERLINK_RATE_LIMIT) || 60;
const DEFAULT_WINDOW_MS = Number(process.env.INTERLINK_RATE_WINDOW_MS) || 60000;

export default class InterlinkServer {
    constructor({ registry, messageBus }) {
        this._app = express();
        this._server = null;
        this._registry = registry;
        this._messageBus = messageBus;
        this._rateLimiter = new RateLimiter({ limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS });
    }

    async start(port) {
        this._app.disable('x-powered-by');
        this._app.use(express.json({ limit: '100kb' }));
        this._app.use((req, res, next) => {
            const key = req.ip || req.socket.remoteAddress || 'unknown';
            const result = this._rateLimiter.check(key);
            if (!result.allowed) {
                res.setHeader('Retry-After', String(result.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }
            next();
        });
        this._app.use('/api/v1', createRoutes({ registry: this._registry, messageBus: this._messageBus }));
        const bindHost = process.env.INTERLINK_BIND_HOST || '127.0.0.1';
        await new Promise((resolve, reject) => {
            this._server = this._app.listen(port, bindHost, resolve);
            this._server.once('error', reject);
        });
    }

    async stop() {
        if (this._server) {
            await new Promise((resolve) => this._server.close(resolve));
            this._server = null;
        }
    }
}
