import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/config/config.js', () => ({
    config: {
        interlink: {
            jwtSecret: '',
            enabled: true,
            grpcAddress: 'http://localhost:50052',
            authKey: 'test-auth-key-min-32-chars-long!!',
            publicKey: '',
            discord: { clientId: 'test-bot' }
        },
        discord: { clientId: 'test-bot' }
    }
}));

vi.mock('../../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn(),
    closeLockRedis: vi.fn(),
    withLock: vi.fn()
}));

import { EventBusImpl } from '../../../src/core/EventBus.js';
import InterlinkPlugin from '../../../src/plugins/interlink/plugin.js';

interface ConnectClientStub {
    send: ReturnType<typeof vi.fn>;
    listBots: ReturnType<typeof vi.fn>;
}

function makeBridgePlugin() {
    const bus = new EventBusImpl();
    let dispatch: ((channel: string, message: string) => void) | undefined;
    bus.enableCrossPod(
        { publish: async () => 1 },
        { subscribe: async () => {}, unsubscribe: async () => {}, on: (_e, l) => { dispatch = l; } },
        'pod-local'
    );
    const manager = { bus, registerSocketHandler: vi.fn() } as never;
    const plugin = new InterlinkPlugin({} as never, manager);
    const client: ConnectClientStub = {
        send: vi.fn(async () => undefined),
        listBots: vi.fn(async () => ({ bots: [{ botId: 'bot-b', online: true }] }))
    };
    const internals = plugin as unknown as { _connectClient: ConnectClientStub | null; _connectBotId: string };
    internals._connectClient = client;
    internals._connectBotId = 'bot-a';
    plugin._setupEventBridge();
    return { bus, dispatch, client };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('interlink event bridge cross-pod guard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    it('forwards local events once and skips cross-pod relayed events', async () => {
        const { bus, dispatch, client } = makeBridgePlugin();

        await bus.emit('memberJoin', { userId: 'u1' });
        await tick();
        await tick();
        expect(client.send).toHaveBeenCalledTimes(1);

        expect(dispatch).toBeDefined();
        dispatch!('apollo:event:memberJoin', JSON.stringify({
            _sourcePodId: 'pod-remote',
            _event: 'memberJoin',
            event: 'memberJoin',
            payload: { userId: 'u2' },
            source: { botId: 'pod-remote', processId: 1, type: 'gateway' },
            timestamp: Date.now()
        }));
        await tick();
        await tick();
        expect(client.send).toHaveBeenCalledTimes(1);
    });

    it('ignores configured forward events in foreign namespaces', async () => {
        process.env['INTERLINK_FORWARD_EVENTS'] = 'moderation:ban';
        try {
            const { bus, client } = makeBridgePlugin();
            await bus.emit('moderation:ban', { id: '1' });
            await tick();
            await tick();
            expect(client.send).not.toHaveBeenCalled();
        } finally {
            delete process.env['INTERLINK_FORWARD_EVENTS'];
        }
    });
});
