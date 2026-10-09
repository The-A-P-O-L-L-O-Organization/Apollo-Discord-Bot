import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerPluginProxy, WorkerUnavailableError } from '../../src/core/WorkerPluginProxy.js';
import { createResponse, isRequest, type RPCMessage, type RPCRequest } from '../../src/core/worker/rpc.js';
import type { CommandModule } from '../../src/types/shared.js';

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
    public deliver = true;
    public send = vi.fn((_pluginId: string, message: RPCMessage): boolean => {
        if (!this.deliver) {
            return false;
        }
        this.child.send(message);
        return true;
    });

    getWorker(_pluginId: string): { child: FakeChild } {
        return { child: this.child };
    }
}

function lastRequest(host: FakeHost): RPCRequest {
    const sent = host.child.sent[host.child.sent.length - 1];
    if (sent === undefined || !isRequest(sent)) {
        throw new Error('Expected a worker RPC request to have been sent');
    }
    return sent;
}

function respondOk(host: FakeHost, result: unknown = { ok: true }): void {
    const request = lastRequest(host);
    host.child.receive(createResponse(request.correlationId, result));
}

describe('WorkerPluginProxy', () => {
    let host: FakeHost;
    let proxy: WorkerPluginProxy;

    beforeEach(() => {
        host = new FakeHost();
        proxy = new WorkerPluginProxy('test-plugin', host, { dir: '/data/plugins/test-plugin' });
    });

    it('exposes plugin id, name and directory', () => {
        expect(proxy.id).toBe('test-plugin');
        expect(proxy.name).toBe('test-plugin');
        expect(proxy.directory).toBe('/data/plugins/test-plugin');
    });

    it('forwards onLoad to worker via lifecycle:load RPC', async() => {
        const pending = proxy.onLoad();
        const request = lastRequest(host);
        expect(request.method).toBe('lifecycle:load');
        expect(request.pluginId).toBe('test-plugin');
        respondOk(host);
        await pending;
        expect(host.send).toHaveBeenCalledWith('test-plugin', expect.objectContaining({ method: 'lifecycle:load' }));
    });

    it('forwards onEnable to worker via lifecycle:enable RPC', async() => {
        const pending = proxy.onEnable();
        expect(lastRequest(host).method).toBe('lifecycle:enable');
        respondOk(host);
        await pending;
    });

    it('forwards onDisable to worker via lifecycle:disable RPC', async() => {
        const pending = proxy.onDisable();
        expect(lastRequest(host).method).toBe('lifecycle:disable');
        respondOk(host);
        await pending;
    });

    it('forwards onUnload to worker via lifecycle:unload RPC', async() => {
        const pending = proxy.onUnload();
        expect(lastRequest(host).method).toBe('lifecycle:unload');
        respondOk(host);
        await pending;
    });

    it('rejects when the worker reports an RPC error', async() => {
        const pending = proxy.onLoad();
        respondOk(host, { ok: false, error: 'boom' });
        await expect(pending).rejects.toThrow('boom');
    });

    it('rejects setup RPCs when no worker is running', async() => {
        host.deliver = false;
        await expect(proxy.onLoad()).rejects.toBeInstanceOf(WorkerUnavailableError);
        await expect(proxy.onEnable()).rejects.toBeInstanceOf(WorkerUnavailableError);
        await expect(proxy.executeCommand('test', {})).rejects.toBeInstanceOf(WorkerUnavailableError);
    });

    it('treats teardown as idempotent when no worker is running', async() => {
        host.deliver = false;
        await expect(proxy.onDisable()).resolves.toBeUndefined();
        await expect(proxy.onUnload()).resolves.toBeUndefined();
    });

    it('ignores responses with unknown correlation ids', async() => {
        const pending = proxy.onLoad();
        host.child.receive(createResponse('rpc-unknown-id', { ok: true }));
        respondOk(host);
        await pending;
    });

    it('ignores malformed worker messages', async() => {
        const pending = proxy.onLoad();
        host.child.receive({ kind: 'bogus' });
        host.child.receive(null);
        respondOk(host);
        await pending;
    });

    it('returns commands from worker via describe RPC', async() => {
        const pending = proxy.getCommands();
        const request = lastRequest(host);
        expect(request.method).toBe('lifecycle:describe');
        expect(request.pluginId).toBe('test-plugin');
        respondOk(host, { ok: true, commands: [{ name: 'test', description: 'Test command' }] });
        await expect(pending).resolves.toEqual([{ name: 'test', description: 'Test command' }]);
        expect(host.send).toHaveBeenCalledWith('test-plugin', expect.objectContaining({ method: 'lifecycle:describe' }));
    });

    it('returns empty commands when the worker reports none', async() => {
        const pending = proxy.getCommands();
        expect(lastRequest(host).method).toBe('lifecycle:describe');
        respondOk(host, { ok: true });
        await expect(pending).resolves.toEqual([]);
    });

    it('rejects getCommands when the worker reports an error', async() => {
        const pending = proxy.getCommands();
        respondOk(host, { ok: false, error: 'nope' });
        await expect(pending).rejects.toThrow('nope');
    });

    it('seeds local commands via setCommands', () => {
        const commands = [{ name: 'test', description: 'Test command' } as CommandModule];
        proxy.setCommands(commands);
        expect(proxy.commands).toEqual([{ name: 'test', description: 'Test command' }]);
    });

    it('forwards event registrations to worker via event:register', () => {
        const handler = vi.fn();
        proxy.registerEvent('messageCreate', handler);
        const request = lastRequest(host);
        expect(request.method).toBe('event:register');
        expect(request.payload).toEqual({ event: 'messageCreate' });
        expect(host.send).toHaveBeenCalledWith('test-plugin', expect.objectContaining({ method: 'event:register' }));
        expect(proxy.events).toEqual([{ event: 'messageCreate', handler }]);
        expect(proxy.eventHandlers).toEqual([{ name: 'messageCreate', handler, once: false }]);
    });

    it('delegates command execution to the worker via command:run', async() => {
        const interaction = { id: 'interaction-1' };
        const pending = proxy.executeCommand('test', interaction);
        const request = lastRequest(host);
        expect(request.method).toBe('command:run');
        expect(request.payload).toEqual({ command: 'test', interaction });
        respondOk(host, { ok: true, output: 'done' });
        const result = await pending;
        expect(result).toMatchObject({ ok: true, output: 'done' });
    });

    it('rejects when the worker never responds within the timeout', async() => {
        const impatient = new WorkerPluginProxy('test-plugin', host, { timeoutMs: 20 });
        await expect(impatient.onLoad()).rejects.toThrow('timed out');
    });
});
