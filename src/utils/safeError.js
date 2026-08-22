// Safe error helper
// Logs the real error server-side but returns a generic message to users
// so internal details (paths, secrets, SQL) never leak in replies.
import { logger } from './utils/logger.js';

export function safeError(error) {
import { logger } from 'logger.js';
    const detail = error && error.message ? error.message : String(error);
    logger.error('[ERROR]', detail);
    return 'An unexpected error occurred. Please try again later.';
}
