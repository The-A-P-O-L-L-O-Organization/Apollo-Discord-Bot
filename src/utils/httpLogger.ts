import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger.js';

function normalizedPath(url: string | undefined): string {
    if (!url) {
        return '/';
    }
    try {
        return new URL(url, 'http://localhost').pathname;
    } catch {
        return '/';
    }
}

export function createHttpLogger(component: string) {
    return pinoHttp({
        logger: createLogger({ component }),
        genReqId: (req, res) => {
            const existing = req.headers['x-request-id'];
            const requestId = typeof existing === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(existing)
                ? existing
                : randomUUID();
            res.setHeader('X-Request-Id', requestId);
            return requestId;
        },
        customProps: req => ({
            route: normalizedPath(req.url)
        }),
        redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["x-github-event"]',
            'req.headers["x-hub-signature-256"]'
        ],
        serializers: {
            req: req => ({
                method: req.method,
                url: normalizedPath(req.url),
                remoteAddress: req.socket.remoteAddress
            })
        }
    });
}
