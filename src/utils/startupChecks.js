// Startup validation helpers
// Fail fast with a clear message instead of a confusing Discord login error.

import { createLogger } from './logger.js';
const logger = createLogger({ component: 'startupChecks' });

const TOKEN_PLACEHOLDERS = new Set(['your-token-here', 'your-discord-bot-token-here']);

/**
 * Warns if ALLOW_UNVERIFIED_PLUGINS is enabled in production
 * @returns {void}
 */
export function warnUnverifiedPlugins() {
    const allowUnverified = process.env.ALLOW_UNVERIFIED_PLUGINS === '1';
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (allowUnverified && isProduction) {
        logger.warn('[SECURITY] ALLOW_UNVERIFIED_PLUGINS is enabled in production! ' +
            'This disables plugin integrity verification and poses a security risk. ' +
            'Set ALLOW_UNVERIFIED_PLUGINS=0 or unset it for production deployments.');
    }
}

/**
 * Validates Postgres pool max against database max_connections
 * Warns and caps if pool max exceeds 80% of max_connections
 * @param {Object} poolConfig - Pool configuration with min/max
 * @param {string} connectionString - Postgres connection string
 * @returns {Promise<void>}
 */
export async function validatePostgresPoolMax(poolConfig, connectionString) {
    if (!poolConfig || typeof poolConfig.max !== 'number') {
        return;
    }

    const { Pool } = await import('pg');
    const testPool = new Pool({ connectionString, max: 1 });
    
    try {
        const result = await testPool.query('SHOW max_connections');
        const maxConnections = parseInt(result.rows[0].max_connections, 10);
        const poolMax = poolConfig.max;
        const threshold = Math.floor(maxConnections * 0.8);

        if (poolMax > threshold) {
            const warning = `[WARN] DB_POOL_MAX (${poolMax}) exceeds 80% of Postgres max_connections (${maxConnections}). ` +
                `Capping pool max to ${threshold} to avoid connection exhaustion.`;
            logger.warn(warning);
            poolConfig.max = threshold;
        }
    } catch (error) {
        // If we can't query max_connections, log a warning but don't fail startup
        logger.warn('[WARN] Could not validate Postgres pool max against max_connections:', error.message);
    } finally {
        await testPool.end();
    }
}

export function assertDiscordToken(token) {
    if (!token || TOKEN_PLACEHOLDERS.has(token)) {
        throw new Error(
            '[FATAL] DISCORD_TOKEN is missing or unset. ' +
            'Set a real bot token in your .env file (see .env.example) before starting.'
        );
    }
}

export function assertEncryptionKey(key) {
    if (!key) {
        throw new Error(
            '[FATAL] ENCRYPTION_KEY is missing. ' +
            'Generate a 32-byte base64 key (e.g., `openssl rand -base64 32`) ' +
            'and set it in your .env file before starting.'
        );
    }
    
    let decoded;
    try {
        decoded = Buffer.from(key, 'base64');
    } catch {
        throw new Error(
            '[FATAL] ENCRYPTION_KEY is not valid base64. ' +
            'Generate a 32-byte base64 key (e.g., `openssl rand -base64 32`).'
        );
    }
    
    if (decoded.length !== 32) {
        throw new Error(
            `[FATAL] ENCRYPTION_KEY decodes to ${decoded.length} bytes, expected 32. ` +
            'Generate a 32-byte base64 key (e.g., `openssl rand -base64 32`).'
        );
    }
}

export function assertOperatorAgreement(operator) {
    if (!operator || typeof operator !== 'object') {
        throw new Error(
            '[FATAL] Operator configuration is missing. ' +
            'Set OPERATOR_AGREEMENT and OPERATOR_CONTACT in your .env file.'
        );
    }

    if (operator.agreed !== true) {
        throw new Error(
            '[FATAL] OPERATOR_AGREEMENT is not set to true. ' +
            'You must read legal/TOS.md and legal/PRIVACY.md, then set ' +
            'OPERATOR_AGREEMENT=true in your .env file to acknowledge the ' +
            'operator responsibilities before the bot will start.'
        );
    }

    if (!operator.contact || typeof operator.contact !== 'string' || operator.contact.trim().length === 0) {
        throw new Error(
            '[FATAL] OPERATOR_CONTACT is empty. ' +
            'You must publish a contact channel (Discord user tag, email, ' +
            'support server invite, etc.) so users of your instance can ' +
            'reach you with privacy requests, deletion requests, and ' +
            'reports of bot misbehavior. Set OPERATOR_CONTACT in your .env file.'
        );
    }
}

export function validateSocketToken() {
    const isProduction = process.env.NODE_ENV === 'production';
    const token = process.env.APOLLO_SOCKET_TOKEN;

    if (isProduction && !token) {
        throw new Error(
            '[FATAL] APOLLO_SOCKET_TOKEN is required in production. ' +
            'Generate a secure random token (e.g., `openssl rand -hex 32`) ' +
            'and set it in your .env file before starting.'
        );
    }
}

export async function validateRedisAuth() {
    const isProduction = process.env.NODE_ENV === 'production';
    const { createRedisClient } = await import('./redis.js');
    const { config } = await import('../config/config.js');

    if (!isProduction || !config.queue.enabled) {
        return;
    }

    if (!config.queue.redis.password && !config.queue.redis.username) {
        throw new Error(
            '[FATAL] Redis authentication (REDIS_PASSWORD or REDIS_USERNAME) is required in production. ' +
            'Configure Redis ACL or password authentication and set it in your .env file.'
        );
    }

    const redis = createRedisClient('startup-check', {
        host: config.queue.redis.host,
        port: config.queue.redis.port,
        password: config.queue.redis.password,
        username: config.queue.redis.username,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true
    });

    try {
        await redis.connect();
        await redis.ping();
    } catch (error) {
        const err = new Error(`[FATAL] Redis authentication failed: ${error.message}`);
        err.cause = error;
        throw err;
    } finally {
        await redis.quit();
    }
}

export async function validateInterlinkBind() {
    const isProduction = process.env.NODE_ENV === 'production';
    const { config } = await import('../config/config.js');

    if (isProduction && config.interlink.enabled && config.interlink.bindHost === '0.0.0.0') {
        throw new Error(
            '[FATAL] INTERLINK_BIND_HOST=0.0.0.0 is not allowed in production. ' +
            'Set INTERLINK_BIND_HOST=127.0.0.1 or a specific private IP in your .env file.'
        );
    }
    
    if (config.interlink.enabled && config.interlink.bindHost !== '127.0.0.1' && config.interlink.bindHost !== '::1') {
        logger.warn(`[WARN] Interlink binding to ${config.interlink.bindHost} — ensure this is intentional and firewalled.`);
    }
}
