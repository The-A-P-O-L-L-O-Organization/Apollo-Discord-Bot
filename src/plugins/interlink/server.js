import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import createRoutes from './routes.js';
import RateLimiter from './rateLimit.js';
import { register } from '../../utils/metrics.js';

import { config } from '../../config/config.js';

const DEFAULT_LIMIT = Number(process.env.INTERLINK_RATE_LIMIT) || 60;
const DEFAULT_WINDOW_MS = Number(process.env.INTERLINK_RATE_WINDOW_MS) || 60000;
const HEALTH_RATE_LIMIT = Number(process.env.INTERLINK_HEALTH_RATE_LIMIT) || 30;
const HEALTH_WINDOW_MS = Number(process.env.INTERLINK_HEALTH_WINDOW_MS) || 60000;

// Trust proxy for X-Forwarded-For header (set to true if behind reverse proxy)
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

export default class InterlinkServer {
    constructor({ registry, messageBus }) {
        this._app = express();
        this._server = null;
        this._registry = registry;
        this._messageBus = messageBus;
        this._rateLimiter = new RateLimiter({ limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS });
        this._healthRateLimiter = new RateLimiter({ limit: HEALTH_RATE_LIMIT, windowMs: HEALTH_WINDOW_MS });
        
        if (TRUST_PROXY) {
            this._app.set('trust proxy', true);
        }
    }

    async start(port) {
        this._app.disable('x-powered-by');
        
        // Helmet for CSP and security headers
        this._app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
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
        
        this._app.use(compression()); // gzip responses
        this._app.use(express.json({ limit: '100kb' }));
        
        // Global rate limiter for API routes
        this._app.use('/api/v1', (req, res, next) => {
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
            
            // Lenient rate limit for metrics
            const rateKey = TRUST_PROXY && req.headers['x-forwarded-for']
                ? req.headers['x-forwarded-for'].split(',')[0].trim()
                : req.ip || req.socket.remoteAddress || 'unknown';
            const rateResult = this._healthRateLimiter.check(rateKey);
            if (!rateResult.allowed) {
                res.setHeader('Retry-After', String(rateResult.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }
            
            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            } catch (err) {
                res.status(500).end(err.message);
            }
        });
        
        // Health check endpoint with lenient rate limit
        this._app.get('/health', (req, res) => {
            const rateKey = TRUST_PROXY && req.headers['x-forwarded-for']
                ? req.headers['x-forwarded-for'].split(',')[0].trim()
                : req.ip || req.socket.remoteAddress || 'unknown';
            const rateResult = this._healthRateLimiter.check(rateKey);
            if (!rateResult.allowed) {
                res.setHeader('Retry-After', String(rateResult.retryAfter));
                return res.status(429).json({ error: 'Too many requests' });
            }
            
            res.json({ status: 'ok', timestamp: Date.now() });
        });
        
        const bindHost = config.interlink.bindHost;
        if (bindHost !== '127.0.0.1' && bindHost !== '::1') {
            console.warn(`[WARN] Interlink binding to ${bindHost} — ensure this is intentional and firewalled.`);
        }
        
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
