import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginInstance } from '../../../src/core/worker/workerChild.js';
import type { RPCMessage } from '../../../src/core/worker/rpc.js';
import { runChild } from '../../../src/core/worker/workerChild.js';

type RunChildOptions = Parameters<typeof runChild>[0];

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
            env: { PLUGIN_ID: 'fake' },
            send: vi.fn(),
            on: vi.fn(),
            exit: vi.fn()
        };
    });

    it('should wire plugin onLoad and respond to command requests', async() => {
        const child = await runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
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

        const sent = processLike.send.mock.calls[0]![0];
        expect(sent.kind).toBe('response');
        expect(sent.result).toEqual({ ok: true, output: 'hi x' });
        expect(sent.correlationId).toBe('c1');
    });

    it('should respond with error result on exception', async() => {
        const child = await runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
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

        const sent = processLike.send.mock.calls[0]![0];
        expect(sent.kind).toBe('response');
        expect(sent.result.ok).toBe(false);
        expect(sent.result.error).toBe('boom');
    });

    it('should handle lifecycle:load', async() => {
        let loaded = false;
        const child = await runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
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
        const sent = processLike.send.mock.calls[0]![0];
        expect(sent.result.ok).toBe(true);
    });

    it('should reject plugins without static id', async() => {
        await expect(runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
            processLike: processLike as unknown as RunChildOptions['processLike'],
            loader: (async () => ({ default: class NoId {} })) as unknown as () => Promise<{ default: PluginInstance }>
        })).rejects.toThrow(/static id/);
    });
});
