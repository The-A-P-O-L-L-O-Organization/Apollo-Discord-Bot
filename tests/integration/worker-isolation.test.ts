import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fork } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequest } from '../../src/core/worker/rpc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const childEntry = join(__dirname, '../fixtures/worker-plugins/child-entry.js');
const fixtureDir = join(__dirname, '../fixtures/worker-plugins/demo');

describe('worker isolation integration', () => {
    let child;
    let pending;

    beforeAll(async() => {
        child = fork(childEntry, [], {
            env: {
                ...process.env,
                PLUGIN_ID: 'demo',
                PLUGIN_DIR: fixtureDir,
                PLUGIN_CAPABILITIES: JSON.stringify(['events:messageCreate', 'api:sendMessage'])
            },
            stdio: ['inherit', 'inherit', 'inherit', 'ipc']
        });
        pending = new Map();
        child.on('message', (msg) => {
            if (pending.has(msg.correlationId)) {
                pending.get(msg.correlationId)(msg.result);
                pending.delete(msg.correlationId);
            }
        });
        await new Promise((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', reject);
        });
    });

    afterAll(() => {
        child.kill();
    });

    function rpc(method, payload) {
        const req = createRequest('demo', method, payload);
        return new Promise((resolve) => {
            pending.set(req.correlationId, resolve);
            child.send(req);
        });
    }

    it('should load a plugin in a child process', async() => {
        const result = await rpc('lifecycle:load', {});
        expect(result.ok).toBe(true);
    });

    it('should dispatch events to the plugin', async() => {
        const event = await rpc('event:emit', { event: 'events:messageCreate', data: { id: 'm1', content: 'hello' } });
        expect(event.ok).toBe(true);
    });

    it('should run a command handler', async() => {
        const result = await rpc('command:run', { name: 'apollo' });
        expect(result.ok).toBe(true);
        expect(result.echoed).toBe('apollo');
    });

    it('should deny capabilities not granted', async() => {
        const result = await rpc('api:setOwnConfig', {});
        expect(result.ok).toBe(false);
    });
});
