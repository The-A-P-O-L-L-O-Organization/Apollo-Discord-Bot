import { Router } from 'express';
import { createAuthMiddleware } from './auth.js';
import { logger } from './utils/logger.js';

export default function createRoutes({ registry, messageBus }) {
import { logger } from '../../utils/logger.js';
    const router = Router();
    const authMiddleware = createAuthMiddleware(registry);

    router.get('/health', (req, res) => {
        res.json({ status: 'ok', service: 'interlink', timestamp: Date.now() });
    });

    router.post('/message', authMiddleware, async(req, res) => {
        try {
            const envelope = req.body;
            if (!envelope || !envelope.type || !envelope.protocol) {
                return res.status(400).json({ error: 'Invalid message envelope' });
            }
            if (envelope.protocol !== 'interlink') {
                return res.status(400).json({ error: `Unsupported protocol: ${envelope.protocol}` });
            }
            const validTypes = ['ping', 'pong', 'command', 'event', 'custom'];
            if (!validTypes.includes(envelope.type)) {
                return res.status(400).json({ error: `Unknown message type: ${envelope.type}` });
            }

            let responseEnvelope = null;
            await messageBus.handleIncomingMessage(envelope, (resp) => {
                responseEnvelope = resp;
            });

            if (responseEnvelope) {
                return res.json(responseEnvelope);
            }
            res.json({ status: 'accepted', id: envelope.id });
        } catch (err) {
            logger.error('[Interlink:Routes] Error handling message:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}
