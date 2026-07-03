import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const KEY_BYTES = 32;
const KEY_PREFIX_LEN = 8;
const BCRYPT_ROUNDS = 10;

export function generateApiKey() {
    const rawKey = crypto.randomBytes(KEY_BYTES).toString('hex');
    const prefix = rawKey.slice(0, KEY_PREFIX_LEN);
    const salt = bcrypt.genSaltSync(BCRYPT_ROUNDS);
    const hash = bcrypt.hashSync(rawKey, salt);
    return { rawKey, hash, prefix };
}

export async function hashKey(rawKey) {
    return bcrypt.hash(rawKey, BCRYPT_ROUNDS);
}

export async function validateApiKey(rawKey, hash) {
    return bcrypt.compare(rawKey, hash);
}

export function extractKeyPrefix(rawKey) {
    return rawKey.slice(0, KEY_PREFIX_LEN);
}

export function createAuthMiddleware(registry) {
    return async (req, res, next) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }
        const rawKey = header.slice(7).trim();
        if (!rawKey) {
            return res.status(401).json({ error: 'Empty API key' });
        }
        const prefix = extractKeyPrefix(rawKey);
        const bot = await registry.findByApiKeyPrefix(prefix);
        if (!bot) {
            return res.status(401).json({ error: 'Unknown API key' });
        }
        const valid = await validateApiKey(rawKey, bot.api_key_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        req.interlinkBot = bot;
        next();
    };
}
