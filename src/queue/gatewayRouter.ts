// Gateway Router - TypeScript migration

import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { createQueue } from './queue.js';

export const INLINE_NONCE_TTL = 300000;
const INLINE_NONCE_CLEANUP_INTERVAL = 60000;

const inlineNonceCache = new Map<string, { expiresAt: number }>();

export function checkAndSetInlineNonce(nonce: string): boolean {
    const now = Date.now();
    const entry = inlineNonceCache.get(nonce);
    if (entry && entry.expiresAt > now) {
        return false;
    }
    inlineNonceCache.set(nonce, { expiresAt: now + INLINE_NONCE_TTL });
    return true;
}

export function pruneInlineNonceCache(now: number = Date.now()): void {
    for (const [nonce, entry] of inlineNonceCache) {
        if (entry.expiresAt <= now) {
            inlineNonceCache.delete(nonce);
        }
    }
}

export function clearInlineNonceCache(): void {
    inlineNonceCache.clear();
}

const inlineNonceCleanupTimer = setInterval(() => {
    pruneInlineNonceCache();
}, INLINE_NONCE_CLEANUP_INTERVAL);
if (typeof inlineNonceCleanupTimer.unref === 'function') {
    inlineNonceCleanupTimer.unref();
}

export function stopInlineNonceCleanup(): void {
    clearInterval(inlineNonceCleanupTimer);
}

function resolveInlineNonce(data: unknown): string {
    if (typeof data === 'object' && data !== null) {
        const record = data as Record<string, unknown>;
        const interaction = record['interaction'];
        if (typeof interaction === 'object' && interaction !== null) {
            const interactionId = (interaction as Record<string, unknown>)['id'];
            if (typeof interactionId === 'string' && interactionId.length > 0) {
                return interactionId;
            }
        }
        const id = record['id'];
        if (typeof id === 'string' && id.length > 0) {
            return id;
        }
    }
    return JSON.stringify(data) ?? 'unknown';
}

export async function queueOrRun<T, R>(
    jobName: string,
    data: T,
    handler: (_data: T) => Promise<R>
): Promise<{ queued: true; jobId: string } | { queued: false; result: R }> {
    if (config.queue.enabled) {
        const queue = await createQueue(config.queue.prefix);
        const job = await queue.add(jobName, data);
        logger.info(`[Gateway] Enqueued ${jobName} as job ${job.id}`);
        return { queued: true, jobId: job.id! };
    }
    const nonce = resolveInlineNonce(data);
    if (!checkAndSetInlineNonce(nonce)) {
        logger.warn(`[Gateway] Duplicate inline ${jobName} rejected`);
        return { queued: false, result: { duplicate: true } as R };
    }
    const result = await handler(data);
    return { queued: false, result };
}
