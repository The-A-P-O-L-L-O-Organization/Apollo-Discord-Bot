import { Router } from 'express';
import { createAuthMiddleware } from './auth.js';
import { ReplayProtection, createReplayProtectionMiddleware } from './replayProtection.js';
import { logger } from '../../utils/logger.js';

export default function createRoutes({ registry, messageBus, redis, config }: {
    registry: any;
    messageBus: any;
    redis: any;
    config: any;
}): ReturnType<typeof Router> {
    const router = Router();
    const authMiddleware = createAuthMiddleware(registry);

    const replayProtection = new ReplayProtection({
        redis,
        windowMs: config.interlink?.replayWindowMs ?? 5 * 60 * 1000,
        nonceTtlMs: config.interlink?.nonceTtlMs ?? 10 * 60 * 1000
    });
    const replayMiddleware = createReplayProtectionMiddleware(replayProtection);

    router.get('/health', (_req: any, res: any) => {
        res.json({ status: 'ok', service: 'interlink', timestamp: Date.now() });
    });

    router.post('/message', authMiddleware, replayMiddleware, async (req: any, res: any) => {
        try {
            const envelope = req.body as { type?: unknown; protocol?: unknown; id?: unknown } | undefined;
            if (!envelope?.type || !envelope.protocol) {
                return res.status(400).json({ error: 'Invalid message envelope' });
            }
            const protocol = envelope.protocol as string;
            const messageType = envelope.type as string;
            if (protocol !== 'interlink') {
                return res.status(400).json({ error: `Unsupported protocol: ${protocol}` });
            }
            const validTypes = ['ping', 'pong', 'command', 'event', 'custom'];
            if (!validTypes.includes(messageType)) {
                return res.status(400).json({ error: `Unknown message type: ${messageType}` });
            }

            let responseEnvelope = null;
            await messageBus.handleIncomingMessage(envelope, (resp: any) => {
                responseEnvelope = resp;
            });

            if (responseEnvelope) {
                return res.json(responseEnvelope);
            }
            res.json({ status: 'accepted', id: envelope.id });
        } catch (err: any) {
            logger.error({ err: err as Error, msg: '[Interlink:Routes] Error handling message' });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}