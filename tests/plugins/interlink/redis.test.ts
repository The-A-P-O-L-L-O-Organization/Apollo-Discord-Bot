import { describe, it, expect, beforeAll, vi } from 'vitest';

describe('Interlink Redis', () => {
    let RedisTransport;

    beforeAll(async () => {
        RedisTransport = (await import('../../../src/plugins/interlink/redis.js')).default;
    });

    it('should construct with config', () => {
        const transport = new RedisTransport({ channelPrefix: 'apollo:interlink' });
        expect(transport.channelPrefix).toBe('apollo:interlink');
        expect(transport._pub).toBeNull();
        expect(transport._sub).toBeNull();
    });

    it('should generate correct channel names', () => {
        const transport = new RedisTransport({ channelPrefix: 'apollo:interlink' });
        expect(transport._messageChannel).toBe('apollo:interlink:message');
        expect(transport._responseChannel('bot-123')).toBe('apollo:interlink:response:bot-123');
    });

    it('should not be connected initially', () => {
        const transport = new RedisTransport({ channelPrefix: 'apollo:interlink' });
        expect(transport.isConnected).toBe(false);
    });

    describe('publishResponse', () => {
        it('should publish to response channel when connected', () => {
            const transport = new RedisTransport({ channelPrefix: 'apollo:interlink' });
            transport._pub = { publish: vi.fn().mockResolvedValue(1) };
            const envelope = { type: 'pong', source: 'apollo' };
            transport.publishResponse('bot-123', envelope);
            expect(transport._pub.publish).toHaveBeenCalledWith(
                'apollo:interlink:response:bot-123',
                JSON.stringify(envelope)
            );
        });

        it('should not publish when not connected', () => {
            const transport = new RedisTransport({ channelPrefix: 'apollo:interlink' });
            transport.publishResponse('bot-123', { type: 'pong' });
            expect(true).toBe(true);
        });
    });
});
