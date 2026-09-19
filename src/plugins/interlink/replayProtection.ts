import crypto from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;

interface NonceStore {
    set(key: string, value: string, px: 'PX', ttlMs: number, nx: 'NX'): Promise<unknown>;
}

export class ReplayProtection {
    _redis: NonceStore | null;
    _windowMs: number;
    _nonceTtlMs: number;

    constructor({ redis, windowMs = DEFAULT_WINDOW_MS, nonceTtlMs = DEFAULT_NONCE_TTL_MS }: {
        redis: unknown;
        windowMs?: number;
        nonceTtlMs?: number;
    }) {
        this._redis = (redis !== null && typeof redis === 'object' && typeof (redis as { set?: unknown }).set === 'function')
            ? (redis as NonceStore)
            : null;
        this._windowMs = windowMs;
        this._nonceTtlMs = nonceTtlMs;
    }

    async checkAndStore(senderId: string, nonce: string, timestamp: number) {
        const now = Date.now();

        if (Math.abs(now - timestamp) > this._windowMs) {
            return { allowed: false, reason: 'Timestamp outside freshness window' };
        }

        if (!this._redis) {
            return { allowed: true };
        }
        const result = await this._redis.set(`interlink:replay:${senderId}:${nonce}`, '1', 'PX', this._nonceTtlMs, 'NX');

        if (!result) {
            return { allowed: false, reason: 'Duplicate nonce (replay detected)' };
        }

        return { allowed: true };
    }

    static generateNonce(): string {
        return crypto.randomBytes(16).toString('hex');
    }
}

export function createReplayProtectionMiddleware(replayProtection: ReplayProtection) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const envelope = req.body as { nonce?: unknown; timestamp?: unknown } | undefined;
        const senderId = req.interlinkBot?.name;

        if (!senderId || !envelope) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        const nonce = envelope.nonce as string | undefined;
        const timestamp = envelope.timestamp as number | undefined;

        if (!nonce || !timestamp) {
            return res.status(400).json({ error: 'Missing nonce or timestamp' });
        }

        const result = await replayProtection.checkAndStore(senderId, nonce, timestamp);

        if (!result.allowed) {
            return res.status(409).json({ error: result.reason });
        }

        next();
    };
}