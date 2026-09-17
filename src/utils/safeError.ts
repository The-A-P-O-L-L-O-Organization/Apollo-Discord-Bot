// Safe error helper
// Logs the real error server-side but returns a generic message to users
// so internal details (paths, secrets, SQL) never leak in replies.
import { logger } from './logger.js';

export function safeError(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    // @ts-expect-error - pino logger overloaded types
    logger.error('[ERROR]', detail);
    return 'An unexpected error occurred. Please try again later.';
}