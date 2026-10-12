import { describe, it, expect } from 'vitest';
import EventBusImpl from '../../../src/core/EventBus.js';

describe('PluginBusView cross-pod delivery', () => {
    it('routes gateway-pod view emits to worker-pod view handlers over unchanged channels', async () => {
        const published: { channel: string; message: string }[] = [];
        let workerDispatch: ((channel: string, message: string) => void) | undefined;

        const gateway = new EventBusImpl();
        gateway.enableCrossPod(
            { publish: async (channel, message) => { published.push({ channel, message }); return 1; } },
            { subscribe: async () => {}, unsubscribe: async () => {}, on: () => {} },
            'pod-gateway'
        );

        const worker = new EventBusImpl();
        worker.enableCrossPod(
            { publish: async () => 1 },
            {
                subscribe: async () => {},
                unsubscribe: async () => {},
                on: (_e, listener) => { workerDispatch = listener; }
            },
            'pod-worker'
        );

        const workerView = worker.createView('interlink');
        const delivered: unknown[] = [];
        workerView.on('interlink:message:ping', async (m) => { delivered.push(m.payload); });

        const gatewayView = gateway.createView('interlink');
        gateway.on('interlink:message:ping', async () => {}, 'interlink');
        await gatewayView.emit('interlink:message:ping', { nonce: 'n1' });

        expect(published).toHaveLength(1);
        expect(published[0]?.channel).toBe('apollo:event:interlink:message:ping');

        const payload = JSON.parse(published[0]!.message) as Record<string, unknown>;
        expect(payload['_sourcePodId']).toBe('pod-gateway');
        expect(payload['_event']).toBe('interlink:message:ping');

        expect(workerDispatch).toBeDefined();
        workerDispatch!(published[0]!.channel, published[0]!.message);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delivered).toEqual([{ nonce: 'n1' }]);
    });

    it('skips messages originating from its own pod', async () => {
        const delivered: unknown[] = [];
        const bus = new EventBusImpl();
        let listener: ((channel: string, message: string) => void) | undefined;
        bus.enableCrossPod(
            { publish: async () => 1 },
            { subscribe: async () => {}, unsubscribe: async () => {}, on: (_e, l) => { listener = l; } },
            'pod-a'
        );
        const view = bus.createView('interlink');
        view.on('interlink:message:ping', async (m) => { delivered.push(m.payload); });

        await view.emit('interlink:message:ping', { nonce: 'self' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delivered).toEqual([{ nonce: 'self' }]);
        delivered.length = 0;
        expect(listener).toBeDefined();
        listener!('apollo:event:interlink:message:ping', JSON.stringify({
            _sourcePodId: 'pod-a',
            _event: 'interlink:message:ping',
            event: 'interlink:message:ping',
            payload: { nonce: 'self' },
            source: { botId: 'pod-a', processId: 1, type: 'gateway' },
            timestamp: Date.now()
        }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delivered).toEqual([]);
    });
});
