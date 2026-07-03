import { describe, it, expect, beforeAll, vi } from 'vitest';

describe('Interlink MessageBus', () => {
    let MessageBus;

    beforeAll(async () => {
        MessageBus = (await import('../../../src/plugins/interlink/messageBus.js')).default;
    });

    it('should create envelope with correct structure', () => {
        const bus = new MessageBus({ config: {} });
        const envelope = bus.createEnvelope('ping', 'all', {});
        expect(envelope.protocol).toBe('interlink');
        expect(envelope.version).toBe('1');
        expect(envelope.type).toBe('ping');
        expect(envelope.target).toBe('all');
        expect(envelope.source).toBe('apollo');
        expect(envelope.id).toBeTruthy();
        expect(envelope.timestamp).toBeTruthy();
        expect(envelope.payload).toEqual({});
    });

    it('should create envelope with specific target', () => {
        const bus = new MessageBus({ config: {} });
        const envelope = bus.createEnvelope('command', 'test-bot', { command: 'maintenance', params: { mode: 'on' } });
        expect(envelope.target).toBe('test-bot');
        expect(envelope.type).toBe('command');
        expect(envelope.payload.command).toBe('maintenance');
    });

    it('should reject unknown message types', () => {
        const bus = new MessageBus({ config: {} });
        expect(() => bus.createEnvelope('unknown', 'all', {})).toThrow('Invalid message type');
    });

    it('should send message to a specific bot via HTTP', async () => {
        const mockRegistry = {
            get: vi.fn().mockResolvedValue({ name: 'test-bot', webhook_url: 'https://example.com/hook' })
        };
        const bus = new MessageBus({ registry: mockRegistry, config: { requestTimeout: 5000, maxRetries: 0 } });
        vi.spyOn(bus, '_sendHttp').mockResolvedValue({ success: true, status: 200 });

        const result = await bus.send('test-bot', 'ping', {});
        expect(mockRegistry.get).toHaveBeenCalledWith('test-bot');
        expect(result.success).toBe(true);
    });

    it('should broadcast message to all active bots', async () => {
        const mockRegistry = {
            list: vi.fn().mockResolvedValue([
                { name: 'bot-a', webhook_url: 'https://a.com/hook', is_active: 1 },
                { name: 'bot-b', webhook_url: 'https://b.com/hook', is_active: 1 },
                { name: 'bot-c', webhook_url: 'https://c.com/hook', is_active: 0 }
            ])
        };
        const bus = new MessageBus({ registry: mockRegistry, config: { requestTimeout: 5000, maxRetries: 0 } });
        vi.spyOn(bus, '_sendHttp').mockResolvedValue({ success: true, status: 200 });

        const results = await bus.broadcast('ping', {});
        expect(mockRegistry.list).toHaveBeenCalled();
        expect(results.length).toBe(2);
    });

    it('should handle incoming message and emit event on bus', async () => {
        const emitted = [];
        const bus = new MessageBus({ config: {} });
        bus.eventBus = {
            emit: vi.fn().mockImplementation((event, payload) => {
                emitted.push({ event, payload });
            })
        };

        const envelope = bus.createEnvelope('custom', 'apollo', { hello: 'world' });
        await bus.handleIncomingMessage(envelope);
        expect(bus.eventBus.emit).toHaveBeenCalledWith('interlink:message:custom', expect.objectContaining({
            type: 'custom',
            payload: { hello: 'world' }
        }));
    });

    it('should respond to ping with pong via callback', async () => {
        const bus = new MessageBus({ config: {} });
        let responseSent = null;
        const envelope = bus.createEnvelope('ping', 'apollo', {});

        await bus.handleIncomingMessage(envelope, (envelope) => {
            responseSent = envelope;
        });

        expect(responseSent).not.toBeNull();
        expect(responseSent.type).toBe('pong');
        expect(responseSent.payload.status).toBe('ok');
    });
});
