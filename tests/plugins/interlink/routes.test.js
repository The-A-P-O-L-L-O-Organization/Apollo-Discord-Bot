import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import InterlinkServer from '../../../src/plugins/interlink/server.js';

const { mockBcrypt } = vi.hoisted(() => {
    const mockBcrypt = {
        compare: vi.fn(),
        hash: vi.fn(),
        genSaltSync: vi.fn(() => 'salt'),
        hashSync: vi.fn(() => '$2a$10$hash')
    };
    return { mockBcrypt };
});

vi.mock('bcryptjs', () => ({
    default: mockBcrypt,
    compare: mockBcrypt.compare,
    hash: mockBcrypt.hash,
    genSaltSync: mockBcrypt.genSaltSync,
    hashSync: mockBcrypt.hashSync
}));

describe('Interlink Routes', () => {
    let app;
    let mockRegistry;
    let mockMessageBus;

    beforeAll(async () => {
        mockRegistry = {
            findByApiKeyPrefix: vi.fn()
        };
        mockMessageBus = {
            handleIncomingMessage: vi.fn()
        };
        const createRoutes = (await import('../../../src/plugins/interlink/routes.js')).default;
        app = express();
        app.use(express.json());
        app.use('/api/v1', createRoutes({ registry: mockRegistry, messageBus: mockMessageBus }));
    });

    it('GET /api/v1/health returns status ok', async () => {
        const res = await request(app).get('/api/v1/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('interlink');
    });

    it('POST /api/v1/message returns 401 without auth', async () => {
        const res = await request(app)
            .post('/api/v1/message')
            .send({ type: 'ping', protocol: 'interlink' });
        expect(res.status).toBe(401);
    });

    it('POST /api/v1/message returns 401 with bad auth', async () => {
        mockRegistry.findByApiKeyPrefix.mockResolvedValue(null);
        const res = await request(app)
            .post('/api/v1/message')
            .set('Authorization', 'Bearer invalid-key')
            .send({ type: 'ping', protocol: 'interlink' });
        expect(res.status).toBe(401);
    });

    it('POST /api/v1/message accepts valid message with auth', async () => {
        mockBcrypt.compare.mockResolvedValue(true);
        mockRegistry.findByApiKeyPrefix.mockResolvedValue({
            id: 'bot-1',
            name: 'test-bot',
            api_key_hash: '$2a$10$hash'
        });
        mockMessageBus.handleIncomingMessage.mockResolvedValue();

        const res = await request(app)
            .post('/api/v1/message')
            .set('Authorization', 'Bearer valid-key')
            .send({
                protocol: 'interlink',
                version: '1',
                type: 'custom',
                source: 'test-bot',
                target: 'apollo',
                id: 'msg-1',
                timestamp: Date.now(),
                payload: { hello: 'world' }
            });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('accepted');
    });

    it('POST /api/v1/message returns pong for ping type', async () => {
        mockBcrypt.compare.mockResolvedValue(true);
        mockRegistry.findByApiKeyPrefix.mockResolvedValue({
            id: 'bot-2',
            name: 'ping-bot',
            api_key_hash: '$2a$10$hash'
        });

        mockMessageBus.handleIncomingMessage.mockImplementation((envelope, cb) => {
            cb({
                protocol: 'interlink',
                version: '1',
                type: 'pong',
                source: 'apollo',
                target: 'ping-bot',
                id: 'pong-1',
                timestamp: Date.now(),
                payload: { status: 'ok', uptime: 123 }
            });
        });

        const res = await request(app)
            .post('/api/v1/message')
            .set('Authorization', 'Bearer valid-key')
            .send({
                protocol: 'interlink',
                version: '1',
                type: 'ping',
                source: 'ping-bot',
                target: 'apollo',
                id: 'ping-1',
                timestamp: Date.now(),
                payload: {}
            });
        expect(res.status).toBe(200);
        expect(res.body.type).toBe('pong');
    });

    it('POST /api/v1/message returns 400 for invalid envelope', async () => {
        mockBcrypt.compare.mockResolvedValue(true);
        mockRegistry.findByApiKeyPrefix.mockResolvedValue({
            id: 'bot-3',
            name: 'bad-bot',
            api_key_hash: '$2a$10$hash'
        });

        const res = await request(app)
            .post('/api/v1/message')
            .set('Authorization', 'Bearer valid-key')
            .send({ invalid: true });
        expect(res.status).toBe(400);
    });

    it('should return 429 when rate limit is exceeded', async() => {
        const server = new InterlinkServer({ registry: mockRegistry, messageBus: mockMessageBus });
        server._rateLimiter.limit = 1;
        server._rateLimiter.windowMs = 60000;
        await server.start(0);
        try {
            const res = await request(server._server).get('/api/v1/health');
            expect(res.status).toBe(200);

            const res2 = await request(server._server).get('/api/v1/health');
            expect(res2.status).toBe(429);
            expect(res2.body.error).toBe('Too many requests');
            expect(res2.headers['retry-after']).toBeTruthy();
        } finally {
            await server.stop();
        }
    });
});
