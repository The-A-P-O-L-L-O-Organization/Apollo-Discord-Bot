import { describe, it, expect, beforeAll, vi } from 'vitest';

describe('Interlink Auth', () => {
    let auth;

    beforeAll(async () => {
        auth = await import('../../../src/plugins/interlink/auth.js');
    });

    describe('generateApiKey', () => {
        it('should return rawKey, hash, and prefix', () => {
            const result = auth.generateApiKey();
            expect(result).toHaveProperty('rawKey');
            expect(result).toHaveProperty('hash');
            expect(result).toHaveProperty('prefix');
            expect(typeof result.rawKey).toBe('string');
            expect(result.rawKey.length).toBeGreaterThan(20);
            expect(result.prefix.length).toBe(8);
            expect(result.hash).not.toBe(result.rawKey);
        });

        it('should generate unique keys each call', () => {
            const k1 = auth.generateApiKey();
            const k2 = auth.generateApiKey();
            expect(k1.rawKey).not.toBe(k2.rawKey);
            expect(k1.hash).not.toBe(k2.hash);
        });
    });

    describe('hashKey', () => {
        it('should hash a key using bcrypt', async () => {
            const hash = await auth.hashKey('test-api-key');
            expect(typeof hash).toBe('string');
            expect(hash).not.toBe('test-api-key');
            expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
        });
    });

    describe('validateApiKey', () => {
        it('should return true for matching key', async () => {
            const { rawKey, hash } = auth.generateApiKey();
            const valid = await auth.validateApiKey(rawKey, hash);
            expect(valid).toBe(true);
        });

        it('should return false for wrong key', async () => {
            const { hash } = auth.generateApiKey();
            const valid = await auth.validateApiKey('wrong-key', hash);
            expect(valid).toBe(false);
        });
    });

    describe('extractKeyPrefix', () => {
        it('should return first 8 chars', () => {
            expect(auth.extractKeyPrefix('abcdefghijklmnop')).toBe('abcdefgh');
        });
    });

    describe('createAuthMiddleware', () => {
        let registry;
        let middleware;
        let req;
        let res;

        beforeEach(() => {
            registry = { findByApiKeyPrefix: vi.fn() };
            middleware = auth.createAuthMiddleware(registry);
            req = { headers: {} };
            res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            };
        });

        it('should return a middleware function', () => {
            expect(typeof middleware).toBe('function');
            expect(middleware.length).toBe(3);
        });

        it('should return 401 when Authorization header is missing', async () => {
            await middleware(req, res, vi.fn());
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
        });

        it('should return 401 for non-Bearer Authorization', async () => {
            req.headers.authorization = 'Basic token123';
            await middleware(req, res, vi.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return 401 for empty Bearer token', async () => {
            req.headers.authorization = 'Bearer   ';
            await middleware(req, res, vi.fn());
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Empty API key' });
        });

        it('should return 401 when prefix is unknown', async () => {
            req.headers.authorization = 'Bearer abcdefgh12345678';
            registry.findByApiKeyPrefix.mockResolvedValue(null);
            await middleware(req, res, vi.fn());
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unknown API key' });
        });

        it('should call next() when key is valid', async () => {
            const { rawKey, hash } = auth.generateApiKey();
            req.headers.authorization = `Bearer ${rawKey}`;
            registry.findByApiKeyPrefix.mockResolvedValue({
                id: 'bot-1',
                name: 'test-bot',
                api_key_hash: hash
            });
            const next = vi.fn();
            await middleware(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(req.interlinkBot).toBeDefined();
            expect(req.interlinkBot.name).toBe('test-bot');
        });
    });
});
