import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SocketServer } from '../../src/cli/socket-server.js';
import type PluginManager from '../../src/core/PluginManager.js';

const manager = {} as unknown as PluginManager;

describe('SocketServer', () => {
    it('rejects (does not hang or throw uncaught) when listen fails', async () => {
        const server = new SocketServer(manager, '/proc/apollo-definitely-not/apollo.sock');
        await expect(server.start()).rejects.toThrow();
    });

    it('creates the socket directory and binds', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'apollo-sock-'));
        const socketPath = join(dir, 'nested', 'deep', 'apollo.sock');
        const server = new SocketServer(manager, socketPath);
        try {
            await server.start();
            expect(existsSync(socketPath)).toBe(true);
        } finally {
            await server.stop();
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
