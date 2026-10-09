import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runChild } from '../../src/core/worker/workerChild.js';
import type { PluginInstance } from '../../src/core/worker/workerChild.js';
import { createRequest, createResponse, isRequest } from '../../src/core/worker/rpc.js';
import type { RPCMessage } from '../../src/core/worker/rpc.js';
import { signCapabilities } from '../../src/core/worker/capabilitySignature.js';
import { WorkerHost } from '../../src/core/worker/workerHost.js';
import type { WorkerHostOptions } from '../../src/core/worker/workerHost.js';
import { WorkerPluginProxy } from '../../src/core/WorkerPluginProxy.js';
import { PluginDisabler } from '../../src/core/PluginDisabler.js';
import type { Plugin } from '../../src/core/Plugin.js';
import PluginManager from '../../src/core/PluginManager.js';
import EventBus from '../../src/core/EventBus.js';
import type { TypedClient as PluginClient } from '../../src/core/Plugin.js';
import type { TypedClient as ManagerClient } from '../../src/core/PluginManager.js';

type RunChildOptions = Parameters<typeof runChild>[0];

const TEST_SECRET = 'worker-lifecycle-test-secret';
const PLUGIN_ID = 'lifecycle';

function signedEnv(pluginId: string): Record<string, string> {
    return {
        PLUGIN_ID: pluginId,
        PLUGIN_CAPABILITY_SECRET: TEST_SECRET,
        PLUGIN_CAPABILITIES: JSON.stringify(signCapabilities(pluginId, [], TEST_SECRET))
    };
}

function lifecycleLoader(calls: string[]): () => Promise<{ default: PluginInstance }> {
    return (async () => ({
        default: class LifecyclePlugin {
            static id = 'lifecycle';
            async onLoad(): Promise<void> {
                calls.push('load');
            }
            async onEnable(): Promise<void> {
                calls.push('enable');
            }
            async onDisable(): Promise<void> {
                calls.push('disable');
            }
            async onUnload(): Promise<void> {
                calls.push('unload');
            }
        }
    })) as unknown as () => Promise<{ default: PluginInstance }>;
}

function lastResponse(processLike: { send: ReturnType<typeof vi.fn> }): { result: { ok: boolean; error?: string }; correlationId: string } {
    const calls = processLike.send.mock.calls.map((call) => call[0] as { kind?: string; result: { ok: boolean; error?: string }; correlationId: string });
    const response = [...calls].reverse().find((msg) => msg?.kind === 'response');
    if (!response) {
        throw new Error('Expected a worker RPC response to have been sent');
    }
    return response;
}

class FakeChild {
    public sent: RPCMessage[] = [];
    private listeners: ((msg: unknown) => void)[] = [];

    send(message: RPCMessage): void {
        this.sent.push(message);
    }

    on(_event: string, listener: (msg: unknown) => void): void {
        this.listeners.push(listener);
    }

    receive(msg: unknown): void {
        for (const listener of [...this.listeners]) {
            listener(msg);
        }
    }
}

class FakeHost {
    public child = new FakeChild();
    public send = vi.fn((_pluginId: string, message: RPCMessage): boolean => {
        this.child.send(message);
        return true;
    });

    getWorker(_pluginId: string): { child: FakeChild } {
        return { child: this.child };
    }
}

function respondOk(host: FakeHost, result: unknown = { ok: true }): void {
    const sent = host.child.sent[host.child.sent.length - 1];
    if (!isRequest(sent)) {
        throw new Error('Expected a worker RPC request to have been sent');
    }
    host.child.receive(createResponse(sent.correlationId, result));
}

describe('worker lifecycle handshakes', () => {
    let processLike: {
        send: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        processLike = {
            send: vi.fn(),
            on: vi.fn()
        };
    });

    afterEach(() => {
        delete process.env['PLUGIN_LIFECYCLE-PLUGIN_CAPABILITIES'];
    });

    it('emits lifecycle:ready immediately after capability verification', async () => {
        await runChild({
            pluginDir: '/tmp/fake-lifecycle-plugin',
            env: signedEnv(PLUGIN_ID),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: lifecycleLoader([])
        });

        expect(processLike.send).toHaveBeenCalledTimes(1);
        expect(processLike.send).toHaveBeenCalledWith({ type: 'lifecycle:ready', pluginId: PLUGIN_ID });
    });

    it('executes startup in order: load then enable', async () => {
        const calls: string[] = [];
        const child = await runChild({
            pluginDir: '/tmp/fake-lifecycle-plugin',
            env: signedEnv(PLUGIN_ID),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: lifecycleLoader(calls)
        });

        const loadRequest = createRequest(PLUGIN_ID, 'lifecycle:load', {});
        await child.handleMessage(loadRequest);
        expect(calls).toEqual(['load']);
        const loadResponse = lastResponse(processLike);
        expect(loadResponse.correlationId).toBe(loadRequest.correlationId);
        expect(loadResponse.result.ok).toBe(true);

        const enableRequest = createRequest(PLUGIN_ID, 'lifecycle:enable', {});
        await child.handleMessage(enableRequest);
        expect(calls).toEqual(['load', 'enable']);
        const enableResponse = lastResponse(processLike);
        expect(enableResponse.correlationId).toBe(enableRequest.correlationId);
        expect(enableResponse.result.ok).toBe(true);
    });

    it('executes shutdown in order: disable then unload', async () => {
        const calls: string[] = [];
        const child = await runChild({
            pluginDir: '/tmp/fake-lifecycle-plugin',
            env: signedEnv(PLUGIN_ID),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: lifecycleLoader(calls)
        });

        await child.handleMessage(createRequest(PLUGIN_ID, 'lifecycle:load', {}));
        await child.handleMessage(createRequest(PLUGIN_ID, 'lifecycle:enable', {}));

        await child.handleMessage(createRequest(PLUGIN_ID, 'lifecycle:disable', {}));
        expect(calls).toEqual(['load', 'enable', 'disable']);
        expect(lastResponse(processLike).result.ok).toBe(true);

        await child.handleMessage(createRequest(PLUGIN_ID, 'lifecycle:unload', {}));
        expect(calls).toEqual(['load', 'enable', 'disable', 'unload']);
        expect(lastResponse(processLike).result.ok).toBe(true);
    });

    it('reports lifecycle errors without crashing the child', async () => {
        const child = await runChild({
            pluginDir: '/tmp/fake-lifecycle-plugin',
            env: signedEnv(PLUGIN_ID),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class FailingPlugin {
                    static id = 'lifecycle';
                    async onEnable(): Promise<void> {
                        throw new Error('enable failed');
                    }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        await child.handleMessage(createRequest(PLUGIN_ID, 'lifecycle:enable', {}));
        const sent = lastResponse(processLike);
        expect(sent.result.ok).toBe(false);
        expect(sent.result.error).toBe('enable failed');
    });

    it('tracks the spawn to ready handshake in WorkerHost', async () => {
        const fork = vi.fn().mockReturnValue({
            send: vi.fn(),
            on: vi.fn(),
            kill: vi.fn()
        });
        const host = new WorkerHost({
            fork: fork as unknown as WorkerHostOptions['fork'],
            log: () => undefined
        });

        await host.startPlugin({
            pluginId: 'ready-plugin',
            dir: '/data/plugins/ready-plugin',
            capabilities: [],
            manifest: { id: 'ready-plugin', capabilities: [] }
        });
        expect(host.isWorkerReady('ready-plugin')).toBe(false);

        const child = fork.mock.results[0]!.value as unknown as {
            send: ReturnType<typeof vi.fn>;
            on: ReturnType<typeof vi.fn>;
            kill: ReturnType<typeof vi.fn>;
        };
        const messageHandler = child.on.mock.calls.find((call) => call[0] === 'message')?.[1] as unknown as (msg: unknown) => void;
        expect(messageHandler).toBeTruthy();
        messageHandler({ type: 'lifecycle:ready', pluginId: 'ready-plugin' });
        expect(host.isWorkerReady('ready-plugin')).toBe(true);

        host.terminateWorker('ready-plugin');
        expect(host.isWorkerReady('ready-plugin')).toBe(false);
    });

    it('sends disable then unload before terminating a worker plugin', async () => {
        const host = new FakeHost();
        const pluginId = 'lifecycle-plugin';
        const proxy = new WorkerPluginProxy(pluginId, host, { dir: '/data/plugins/lifecycle-plugin' });
        const terminateWorker = vi.fn((_pluginId: string): boolean => true);
        const unsubscribeAllForPlugin = vi.fn((_pluginId: string): Promise<void> => Promise.resolve());
        const disabler = new PluginDisabler({
            workerHost: {
                terminateWorker,
                isDisabled: (_id: string): boolean => false
            },
            eventBus: { unsubscribeAllForPlugin }
        });
        process.env['PLUGIN_LIFECYCLE-PLUGIN_CAPABILITIES'] = '{"signed":true}';

        const pending = disabler.disable(pluginId, proxy as unknown as Plugin);
        respondOk(host);
        await new Promise((r) => setTimeout(r, 0));
        respondOk(host);
        await pending;

        const methods = host.child.sent.filter((msg) => isRequest(msg)).map((msg) => (msg as unknown as { method: string }).method);
        expect(methods).toEqual(['lifecycle:disable', 'lifecycle:unload']);
        const lastSendOrder = host.send.mock.invocationCallOrder[host.send.mock.invocationCallOrder.length - 1]!;
        const terminateOrder = terminateWorker.mock.invocationCallOrder[0]!;
        expect(lastSendOrder).toBeLessThan(terminateOrder);
        expect(terminateWorker).toHaveBeenCalledWith(pluginId);
        expect(unsubscribeAllForPlugin).toHaveBeenCalledWith(pluginId);
        expect(process.env['PLUGIN_LIFECYCLE-PLUGIN_CAPABILITIES']).toBeUndefined();
    });

    it('runs load, describe and enable in order on install', async () => {
        const client = { commands: new Map(), config: { plugins: { enabled: [], directory: './src/plugins' }, discord: { clientId: '' } }, on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), rest: { put: vi.fn() } } as unknown as PluginClient & ManagerClient;
        const bus = new EventBus();
        const manager = new PluginManager(client, bus);
        const sent: { correlationId: string; method: string }[] = [];
        const listeners: ((msg: unknown) => void)[] = [];
        const child = {
            send: vi.fn(),
            on: vi.fn((_event: string, listener: (msg: unknown) => void) => {
                listeners.push(listener);
            })
        };
        const send = vi.fn((_pluginId: string, msg: { correlationId: string; method: string }): boolean => {
            sent.push(msg);
            const result = msg.method === 'lifecycle:describe'
                ? { ok: true, commands: [] }
                : { ok: true };
            queueMicrotask(() => {
                for (const listener of [...listeners]) {
                    listener({ kind: 'response', correlationId: msg.correlationId, result });
                }
            });
            return true;
        });
        const messageHandlers = new Map<string, ((msg: unknown) => void)[]>();
        const hostMock = {
            startPlugin: vi.fn().mockResolvedValue({ child: { send: vi.fn() }, manifest: { id: 'lifecycle-flow', capabilities: [] } }),
            send,
            getWorker: vi.fn().mockReturnValue({ child }),
            isWorkerReady: vi.fn().mockReturnValue(false),
            on: vi.fn((event: string, handler: (msg: unknown) => void) => {
                messageHandlers.set(event, [...(messageHandlers.get(event) ?? []), handler]);
            }),
            off: vi.fn((event: string, handler: (msg: unknown) => void) => {
                messageHandlers.set(event, (messageHandlers.get(event) ?? []).filter((h) => h !== handler));
            })
        };
        manager.workerHost = hostMock as unknown as PluginManager['workerHost'];

        const pending = manager.loadInstalledPlugin('lifecycle-flow', '/data/plugins/lifecycle-flow', { id: 'lifecycle-flow', name: 'lifecycle-flow', capabilities: [] });
        await new Promise((r) => setTimeout(r, 10));
        for (const handler of [...(messageHandlers.get('workerMessage') ?? [])]) {
            handler({ type: 'lifecycle:ready', pluginId: 'lifecycle-flow' });
        }
        await pending;

        const methods = sent.map((s) => s.method);
        expect(methods.indexOf('lifecycle:load')).toBeLessThan(methods.indexOf('lifecycle:describe'));
        expect(methods.indexOf('lifecycle:describe')).toBeLessThan(methods.indexOf('lifecycle:enable'));
        expect(manager.isEnabled('lifecycle-flow')).toBe(true);
        expect(manager.listPlugins().find((p) => p.id === 'lifecycle-flow')?.loaded).toBe(true);
    });
});
