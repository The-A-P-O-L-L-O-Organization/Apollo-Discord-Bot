import express, { type Application, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Server } from 'node:http';
// @ts-expect-error - unmigrated module
import compression from 'compression';
import helmet from 'helmet';
import createRoutes from './routes.js';
import RateLimiter from './rateLimit.js';
import type BotRegistry from './registry.js';
import type MessageBus from './messageBus.js';
import type RedisTransport from './redis.js';
import { register } from '../../utils/metrics.js';
import { config } from '../../config/config.js';
import type { InterlinkConfig } from '../../types/config.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_LIMIT = Number(process.env['INTERLINK_RATE_LIMIT']) || 60;
const DEFAULT_WINDOW_MS = Number(process.env['INTERLINK_RATE_WINDOW_MS']) || 60000;
const HEALTH_RATE_LIMIT = Number(process.env['INTERLINK_HEALTH_RATE_LIMIT']) || 30;
const HEALTH_WINDOW_MS = Number(process.env['INTERLINK_HEALTH_WINDOW_MS']) || 60000;

// Trust proxy for X-Forwarded-For header (set to true if behind reverse proxy)
const TRUST_PROXY = process.env['TRUST_PROXY'] === 'true';

export default class InterlinkServer {
    _app: Application;
    _server: Server | null;
    _registry: BotRegistry;
    _messageBus: MessageBus;
    _redis: RedisTransport | null;
    _config: InterlinkConfig;
    _rateLimiter: RateLimiter;
    _healthRateLimiter: RateLimiter;

    constructor({ registry, messageBus, redis, config: interlinkConfig }: {
        registry: BotRegistry;
        messageBus: MessageBus;
        redis: RedisTransport | null;
        config: InterlinkConfig;
    }) {
        this._app = express();
        this._server = null;
        this._registry = registry;
        this._messageBus = messageBus;
        this._redis = redis;
        this._config = interlinkConfig;
        this._rateLimiter = new RateLimiter({ limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS });
        this._healthRateLimiter = new RateLimiter({ limit: HEALTH_RATE_LIMIT, windowMs: HEALTH_WINDOW_MS });

        if (TRUST_PROXY) {
            this._app.set('trust proxy', true);
        }
    }

    async start(port: number): Promise<void> {
        const compressionMiddleware = compression as unknown as () => RequestHandler;
        this._app.disable('x-powered-by');

        // Helmet for CSP and security headers
        this._app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ['\'self\''],
                    scriptSrc: ['\'self\''],
                    styleSrc: ['\'self\''],
                    imgSrc: ['\'self\'', 'data:'],
                    connectSrc: ['\'self\''],
                    fontSrc: ['\'self\''],
                    objectSrc: ['\'none\''],
                    mediaSrc: ['\'self\''],
                    frameSrc: ['\'none\'']
                }
            },
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginResourcePolicy: { policy: 'same-origin' },
            dnsPrefetchControl: { allow: false },
            frameguard: { action: 'deny' },
            hidePoweredBy: true,
            hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
            ieNoOpen: true,
            noSniff: true,
            originAgentCluster: true,
            permittedCrossDomainPolicies: { permittedPolicies: 'none' },
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            xssFilter: true
        }));

        this._app.use(compressionMiddleware()); // gzip responses
        this._app.use(express.json({ limit: '100kb' }));

        // Global rate limiter for API routes
        this._app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
            const forwardedFor = req.headers['x-forwarded-for'];
            const key = TRUST_PROXY && typeof forwardedFor === 'string' && forwardedFor.length > 0
                ? (forwardedFor.split(',')[0] ?? '').trim()
                : req.ip ?? req.socket.remoteAddress ?? 'unknown';
            const result = this._rateLimiter.check(key);
            if (!result.allowed) {
                res.setHeader('Retry-After', String(result.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }
            next();
        });

        this._app.use('/api/v1', createRoutes({
            registry: this._registry,
            messageBus: this._messageBus,
            redis: this._redis,
            config: this._config
        }));

        // Metrics endpoint - restrict to localhost only for security
        this._app.get('/metrics', async (req: Request, res: Response) => {
            // Only allow localhost access
            const clientIp = req.ip ?? req.socket.remoteAddress ?? '';
            const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

            if (!isLocalhost) {
                return res.status(403).json({ error: 'Forbidden: metrics endpoint restricted to localhost' });
            }

            // Lenient rate limit for metrics
            const metricsForwardedFor = req.headers['x-forwarded-for'];
            const rateKey = TRUST_PROXY && typeof metricsForwardedFor === 'string' && metricsForwardedFor.length > 0
                ? (metricsForwardedFor.split(',')[0] ?? '').trim()
                : req.ip ?? req.socket.remoteAddress ?? 'unknown';
            const rateResult = this._healthRateLimiter.check(rateKey);
            if (!rateResult.allowed) {
                res.setHeader('Retry-After', String(rateResult.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }

            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            } catch (err: unknown) {
                res.status(500).end(err instanceof Error ? err.message : 'Unknown error');
            }
        });

        // Health check endpoint with lenient rate limit
        this._app.get('/health', (req: Request, res: Response) => {
            const healthForwardedFor = req.headers['x-forwarded-for'];
            const rateKey = TRUST_PROXY && typeof healthForwardedFor === 'string' && healthForwardedFor.length > 0
                ? (healthForwardedFor.split(',')[0] ?? '').trim()
                : req.ip ?? req.socket.remoteAddress ?? 'unknown';
            const rateResult = this._healthRateLimiter.check(rateKey);
            if (!rateResult.allowed) {
                res.setHeader('Retry-After', String(rateResult.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }

            res.json({ status: 'ok', timestamp: Date.now() });
        });

        const interlinkSettings = config.interlink as unknown as Record<string, unknown>;
        const bindHost = interlinkSettings['bindHost'] as string | undefined;
        if (bindHost !== '127.0.0.1' && bindHost !== '::1') {
            logger.warn({ bindHost: bindHost ?? 'all interfaces' }, '[Interlink] Binding to non-loopback address — ensure this is intentional and firewalled.');
        }

        await new Promise<void>((resolve, reject) => {
            const server = bindHost !== undefined
                ? this._app.listen(port, bindHost, () => resolve())
                : this._app.listen(port, () => resolve());
            server.once('error', reject);
            this._server = server;
        });

        // Tune keep-alive for better connection reuse
        const server = this._server;
        if (server) {
            server.keepAliveTimeout = 30000;
            server.headersTimeout = 35000;
        }
    }

    async stop(): Promise<void> {
        const server = this._server;
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            this._server = null;
        }
    }
}