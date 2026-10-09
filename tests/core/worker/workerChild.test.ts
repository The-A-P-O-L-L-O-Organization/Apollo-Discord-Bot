import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginInstance } from '../../../src/core/worker/workerChild.js';
import type { RPCMessage } from '../../../src/core/worker/rpc.js';
import { runChild } from '../../../src/core/worker/workerChild.js';
import { signCapabilities } from '../../../src/core/worker/capabilitySignature.js';

type RunChildOptions = Parameters<typeof runChild>[0];

const TEST_SECRET = 'worker-child-test-secret';

function signedEnv(pluginId: string, capabilities: string[] = []): Record<string, string> {
    return {
        PLUGIN_ID: pluginId,
        PLUGIN_CAPABILITY_SECRET: TEST_SECRET,
        PLUGIN_CAPABILITIES: JSON.stringify(signCapabilities(pluginId, capabilities, TEST_SECRET))
    };
}

function lastResponse(processLike: { send: ReturnType<typeof vi.fn> }): { kind?: string; result: { ok: boolean; error?: string }; correlationId: string } {
    const calls = processLike.send.mock.calls.map(call => call[0] as { kind?: string; result: { ok: boolean; error?: string }; correlationId: string });
    const response = [...calls].reverse().find(msg => msg?.kind === 'response');
    if (!response) {
        throw new Error('Expected a worker RPC response to have been sent');
    }
    return response;
}

describe('workerChild', () => {
    let processLike: {
        env: Record<string, string>;
        send: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        exit: ReturnType<typeof vi.fn>;
    };
    let pluginDir: string;

    beforeEach(() => {
        pluginDir = '/tmp/fake-plugin';
        processLike = {
            env: signedEnv('fake'),
            send: vi.fn(),
            on: vi.fn(),
            exit: vi.fn()
        };
    });

    it('should wire plugin onLoad and respond to command requests', async() => {
        const child = await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class FakePlugin {
                    static get id() { return 'fake'; }
                    async onLoad() { (this as unknown as { loaded: boolean }).loaded = true; }
                    async onCommand(payload: { name: string }) { return { ok: true, output: 'hi ' + payload.name }; }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        const req = { kind: 'request', pluginId: 'fake', method: 'command:run', payload: { name: 'x' }, correlationId: 'c1' };
        child.handleMessage(req as unknown as RPCMessage);

        await new Promise(r => setTimeout(r, 10));

        const sent = lastResponse(processLike);
        expect(sent.kind).toBe('response');
        expect(sent.result).toEqual({ ok: true, output: 'hi x' });
        expect(sent.correlationId).toBe('c1');
    });

    it('should respond with error result on exception', async() => {
        const child = await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class BadPlugin {
                    static get id() { return 'bad'; }
                    async onCommand() { throw new Error('boom'); }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        const req = { kind: 'request', pluginId: 'fake', method: 'command:run', payload: {}, correlationId: 'c2' };
        child.handleMessage(req as unknown as RPCMessage);

        await new Promise(r => setTimeout(r, 10));

        const sent = lastResponse(processLike);
        expect(sent.kind).toBe('response');
        expect(sent.result.ok).toBe(false);
        expect(sent.result.error).toBe('boom');
    });

    it('should handle lifecycle:load', async() => {
        let loaded = false;
        const child = await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class LoadPlugin {
                    static get id() { return 'load'; }
                    async onLoad() { loaded = true; }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        const req = { kind: 'request', pluginId: 'fake', method: 'lifecycle:load', payload: {}, correlationId: 'c3' };
        child.handleMessage(req as unknown as RPCMessage);

        await new Promise(r => setTimeout(r, 10));

        expect(loaded).toBe(true);
        const sent = lastResponse(processLike);
        expect(sent.result.ok).toBe(true);
    });

    it('should reject plugins without static id', async() => {
        await expect(runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({ default: class NoId {} })) as unknown as () => Promise<{ default: PluginInstance }>
        })).rejects.toThrow(/static id/);
    });

    it('should emit lifecycle:ready after plugin verification', async() => {
        await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class ReadyPlugin {
                    static get id() { return 'fake'; }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        expect(processLike.send).toHaveBeenCalledWith({ type: 'lifecycle:ready', pluginId: 'fake' });
    });

    it('should describe plugin commands on lifecycle:describe', async() => {
        const child = await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class DescribePlugin {
                    static get id() { return 'fake'; }
                    commands = [{ name: 'ping', description: 'Ping command' }];
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        const req = { kind: 'request', pluginId: 'fake', method: 'lifecycle:describe', payload: {}, correlationId: 'c4' };
        child.handleMessage(req as unknown as RPCMessage);

        await new Promise(r => setTimeout(r, 10));

        const sent = lastResponse(processLike);
        expect(sent.correlationId).toBe('c4');
        expect(sent.result.ok).toBe(true);
        expect((sent.result as unknown as { commands: unknown }).commands).toEqual([{ name: 'ping', description: 'Ping command' }]);
    });

    it('should return empty commands on lifecycle:describe by default', async() => {
        const child = await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class PlainPlugin {
                    static get id() { return 'fake'; }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        const req = { kind: 'request', pluginId: 'fake', method: 'lifecycle:describe', payload: {}, correlationId: 'c5' };
        child.handleMessage(req as unknown as RPCMessage);

        await new Promise(r => setTimeout(r, 10));

        const sent = lastResponse(processLike);
        expect(sent.correlationId).toBe('c5');
        expect(sent.result.ok).toBe(true);
        expect((sent.result as unknown as { commands: unknown }).commands).toEqual([]);
    });

    it('should acknowledge event:register', async() => {
        const child = await runChild({
            pluginDir,
            env: signedEnv('fake'),
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({
                default: class EventPlugin {
                    static get id() { return 'fake'; }
                }
            })) as unknown as () => Promise<{ default: PluginInstance }>
        });

        const req = { kind: 'request', pluginId: 'fake', method: 'event:register', payload: { event: 'messageCreate' }, correlationId: 'c6' };
        child.handleMessage(req as unknown as RPCMessage);

        await new Promise(r => setTimeout(r, 10));

        const sent = lastResponse(processLike);
        expect(sent.correlationId).toBe('c6');
        expect(sent.result.ok).toBe(true);
    });
});
