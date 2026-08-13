import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runChild } from '../../../src/core/worker/workerChild.js';

describe('workerChild', () => {
    let processLike;
    let pluginDir;

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
            processLike,
            loader: async() => ({
                default: class FakePlugin {
                    static get id() { return 'fake'; }
                    async onLoad() { this.loaded = true; }
                    async onCommand(payload) { return { ok: true, output: 'hi ' + payload.name }; }
                }
            })
        });

        const req = { kind: 'request', method: 'command:run', payload: { name: 'x' }, correlationId: 'c1' };
        child.handleMessage(req);

        await new Promise(r => setTimeout(r, 10));

        const sent = processLike.send.mock.calls[0][0];
        expect(sent.kind).toBe('response');
        expect(sent.result).toEqual({ ok: true, output: 'hi x' });
        expect(sent.correlationId).toBe('c1');
    });

    it('should respond with error result on exception', async() => {
        const child = await runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
            processLike,
            loader: async() => ({
                default: class BadPlugin {
                    static get id() { return 'bad'; }
                    async onCommand() { throw new Error('boom'); }
                }
            })
        });

        const req = { kind: 'request', method: 'command:run', payload: {}, correlationId: 'c2' };
        child.handleMessage(req);

        await new Promise(r => setTimeout(r, 10));

        const sent = processLike.send.mock.calls[0][0];
        expect(sent.kind).toBe('response');
        expect(sent.result.ok).toBe(false);
        expect(sent.result.error).toBe('boom');
    });

    it('should handle lifecycle:load', async() => {
        let loaded = false;
        const child = await runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
            processLike,
            loader: async() => ({
                default: class LoadPlugin {
                    static get id() { return 'load'; }
                    async onLoad() { loaded = true; }
                }
            })
        });

        const req = { kind: 'request', method: 'lifecycle:load', payload: {}, correlationId: 'c3' };
        child.handleMessage(req);

        await new Promise(r => setTimeout(r, 10));

        expect(loaded).toBe(true);
        const sent = processLike.send.mock.calls[0][0];
        expect(sent.result.ok).toBe(true);
    });

    it('should reject plugins without static id', async() => {
        await expect(runChild({
            pluginDir,
            env: { PLUGIN_ID: 'fake' },
            processLike,
            loader: async() => ({ default: class NoId {} })
        })).rejects.toThrow(/static id/);
    });
});
