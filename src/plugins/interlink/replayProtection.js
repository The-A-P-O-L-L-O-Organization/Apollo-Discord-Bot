import crypto from 'crypto';

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;

export class ReplayProtection {
    constructor({ redis, windowMs = DEFAULT_WINDOW_MS, nonceTtlMs = DEFAULT_NONCE_TTL_MS }) {
        this._redis = redis;
        this._windowMs = windowMs;
        this._nonceTtlMs = nonceTtlMs;
    }

    async checkAndStore(senderId, nonce, timestamp) {
        const now = Date.now();
        
        if (Math.abs(now - timestamp) > this._windowMs) {
            return { allowed: false, reason: 'Timestamp outside freshness window' };
        }

        const key = `interlink:replay:${senderId}:${nonce}`;
        const result = await this._redis.set(key, '1', 'PX', this._nonceTtlMs, 'NX');
        
        if (!result) {
            return { allowed: false, reason: 'Duplicate nonce (replay detected)' };
        }

        return { allowed: true };
    }

    static generateNonce() {
        return crypto.randomBytes(16).toString('hex');
    }
}

export function createReplayProtectionMiddleware(replayProtection) {
    return async (req, res, next) => {
        const envelope = req.body;
        const senderId = req.interlinkBot?.name;

        if (!senderId || !envelope) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        if (!envelope.nonce || !envelope.timestamp) {
            return res.status(400).json({ error: 'Missing nonce or timestamp' });
        }

        const result = await replayProtection.checkAndStore(senderId, envelope.nonce, envelope.timestamp);
        
        if (!result.allowed) {
            return res.status(409).json({ error: result.reason });
        }

        next();
    };
}