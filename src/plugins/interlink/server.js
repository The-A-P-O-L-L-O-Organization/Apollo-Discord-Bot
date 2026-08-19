import express from 'express';
import compression from 'compression';
import createRoutes from './routes.js';
import RateLimiter from './rateLimit.js';
import { register } from '../../utils/metrics.js';

const DEFAULT_LIMIT = Number(process.env.INTERLINK_RATE_LIMIT) || 60;
const DEFAULT_WINDOW_MS = Number(process.env.INTERLINK_RATE_WINDOW_MS) || 60000;

// Trust proxy for X-Forwarded-For header (set to true if behind reverse proxy)
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

export default class InterlinkServer {
    constructor({ registry, messageBus }) {
        this._app = express();
        this._server = null;
        this._registry = registry;
        this._messageBus = messageBus;
        this._rateLimiter = new RateLimiter({ limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS });
        
        if (TRUST_PROXY) {
            this._app.set('trust proxy', true);
        }
    }

    async start(port) {
        this._app.disable('x-powered-by');
        this._app.use(compression()); // gzip responses
        this._app.use(express.json({ limit: '100kb' }));
        this._app.use((req, res, next) => {
            // Use X-Forwarded-For if behind trusted proxy, otherwise use direct IP
            const key = TRUST_PROXY && req.headers['x-forwarded-for']
                ? req.headers['x-forwarded-for'].split(',')[0].trim()
                : req.ip || req.socket.remoteAddress || 'unknown';
            const result = this._rateLimiter.check(key);
            if (!result.allowed) {
                res.setHeader('Retry-After', String(result.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }
            next();
        });
        this._app.use('/api/v1', createRoutes({ registry: this._registry, messageBus: this._messageBus }));
        
        // Metrics endpoint - restrict to localhost only for security
        this._app.get('/metrics', async (req, res) => {
            // Only allow localhost access
            const clientIp = req.ip || req.socket.remoteAddress || '';
            const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
            
            if (!isLocalhost) {
                return res.status(403).json({ error: 'Forbidden: metrics endpoint restricted to localhost' });
            }
            
            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            } catch (err) {
                res.status(500).end(err.message);
            }
        });
        
        // Health check endpoint
        this._app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: Date.now() });
        });
        
        const bindHost = process.env.INTERLINK_BIND_HOST || '127.0.0.1';
        await new Promise((resolve, reject) => {
            this._server = this._app.listen(port, bindHost, resolve);
            this._server.once('error', reject);
        });
        
        // Tune keep-alive for better connection reuse
        this._server.keepAliveTimeout = 30000;
        this._server.headersTimeout = 35000;
    }

    async stop() {
        if (this._server) {
            await new Promise((resolve) => this._server.close(resolve));
            this._server = null;
        }
    }
}
