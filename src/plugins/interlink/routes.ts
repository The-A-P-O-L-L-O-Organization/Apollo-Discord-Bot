import { Router, type Request, type Response } from 'express';
import { createAuthMiddleware } from './auth.js';
import { ReplayProtection, createReplayProtectionMiddleware } from './replayProtection.js';
import { logger } from '../../utils/logger.js';
import type BotRegistry from './registry.js';
import type MessageBus from './messageBus.js';
import type { Envelope } from './messageBus.js';
import type RedisTransport from './redis.js';
import type { InterlinkConfig } from '../../types/config.js';

export default function createRoutes({ registry, messageBus, redis, config }: {
    registry: BotRegistry;
    messageBus: MessageBus;
    redis: RedisTransport | null;
    config: InterlinkConfig;
}): ReturnType<typeof Router> {
    const router = Router();
    const authMiddleware = createAuthMiddleware(registry);

    const extraConfig = config as unknown as Record<string, unknown>;
    const replayProtection = new ReplayProtection({
        redis,
        windowMs: (extraConfig['replayWindowMs'] as number | undefined) ?? 5 * 60 * 1000,
        nonceTtlMs: (extraConfig['nonceTtlMs'] as number | undefined) ?? 10 * 60 * 1000
    });
    const replayMiddleware = createReplayProtectionMiddleware(replayProtection);

    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', service: 'interlink', timestamp: Date.now() });
    });

    router.post('/message', authMiddleware, replayMiddleware, async (req: Request, res: Response) => {
        try {
            const envelope = req.body as Envelope | undefined;
            if (!envelope?.type || !envelope.protocol) {
                return res.status(400).json({ error: 'Invalid message envelope' });
            }
            const protocol = envelope.protocol;
            const messageType = envelope.type;
            if (protocol !== 'interlink') {
                return res.status(400).json({ error: `Unsupported protocol: ${protocol}` });
            }
            const validTypes = ['ping', 'pong', 'command', 'event', 'custom'];
            if (!validTypes.includes(messageType)) {
                return res.status(400).json({ error: `Unknown message type: ${messageType}` });
            }

            let responseEnvelope: Envelope | null = null;
            await messageBus.handleIncomingMessage(envelope, (resp: Envelope) => {
                responseEnvelope = resp;
            });

            if (responseEnvelope) {
                return res.json(responseEnvelope);
            }
            res.json({ status: 'accepted', id: envelope.id });
        } catch (err: unknown) {
            logger.error({ err: err as Error, msg: '[Interlink:Routes] Error handling message' });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}