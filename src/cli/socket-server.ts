import net from 'node:net';
import fs from 'node:fs';
import { join } from 'node:path';
import type PluginManager from '../core/PluginManager.js';

export const DEFAULT_SOCKET_PATH = process.env['APOLLO_SOCKET_PATH'] ?? join(process.cwd(), 'data', 'apollo.sock');
const SOCKET_TOKEN = process.env['APOLLO_SOCKET_TOKEN'];

interface SocketMessage {
    id?: string;
    token?: string;
    command?: string;
    args?: Record<string, unknown>;
}

export class SocketServer {
    private pluginManager: PluginManager;
    private socketPath: string;
    private server: net.Server | null = null;

    constructor(pluginManager: PluginManager, socketPath: string = DEFAULT_SOCKET_PATH) {
        this.pluginManager = pluginManager;
        this.socketPath = socketPath;
        this.server = null;
    }

    async start(): Promise<void> {
        try { await fs.promises.unlink(this.socketPath); } catch {
            // Ignore if file doesn't exist
        }
        this.server = net.createServer((socket) => {
            const creds = (socket as net.Socket & { getPeerCredential?: () => { uid: number } }).getPeerCredential?.();
            if (creds) {
                const currentUid = process.getuid?.();
                if (currentUid !== undefined && creds.uid !== 0 && creds.uid !== currentUid) {
                    socket.write(JSON.stringify({ error: 'Unauthorized: peer credential mismatch' }) + '\n');
                    socket.destroy();
                    return;
                }
            }

            let buffer = '';
            socket.on('data', (data: Buffer) => {
                buffer += data.toString();
                const parts = buffer.split('\n');
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    if (!part.trim()) { continue; }
                    try {
                        const msg = JSON.parse(part) as SocketMessage;
                        this._handleMessage(socket, msg);
                    } catch {
                        socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
                    }
                }
            });
            socket.on('error', () => { /* client disconnects are routine */ });
        });
        return new Promise((resolve) => {
            this.server!.listen(this.socketPath, () => {
                try { fs.chmodSync(this.socketPath, 0o600); } catch {
                    // Ignore chmod failures (e.g. on Windows)
                }
                resolve();
            });
        });
    }

    private _handleMessage(socket: net.Socket, msg: SocketMessage): void {
        if (SOCKET_TOKEN) {
            if (msg.token !== SOCKET_TOKEN) {
                socket.write(JSON.stringify({ id: msg.id, error: 'Unauthorized' }) + '\n');
                return;
            }
        }
        const { command, args, id } = msg;
        const handler = this.pluginManager.getSocketHandler(command ?? '');
        if (!handler) {
            socket.write(JSON.stringify({ id, error: `Unknown command: ${String(command)}` }) + '\n');
            return;
        }
        Promise.resolve().then(async () => {
            try {
                const result = await handler(this.pluginManager.client, args);
                socket.write(JSON.stringify({ id, result }) + '\n');
            } catch (e) {
                socket.write(JSON.stringify({ id, error: (e as Error).message }) + '\n');
            }
        });
    }

    async stop(): Promise<void> {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        try { await fs.promises.unlink(this.socketPath); } catch {
            // Ignore if file doesn't exist
        }
    }
}
