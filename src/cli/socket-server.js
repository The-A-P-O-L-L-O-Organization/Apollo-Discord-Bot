import net from 'net';
import fs from 'fs';
import { join } from 'node:path';

const DEFAULT_SOCKET_PATH = process.env.APOLLO_SOCKET_PATH || join(process.cwd(), 'data', 'apollo.sock');
const SOCKET_TOKEN = process.env.APOLLO_SOCKET_TOKEN;

class SocketServer {
    constructor(pluginManager, socketPath = DEFAULT_SOCKET_PATH) {
        this.pluginManager = pluginManager;
        this.socketPath = socketPath;
        this.server = null;
    }

    async start() {
        try { await fs.promises.unlink(this.socketPath); } catch {
            // Ignore if file doesn't exist
        }
        this.server = net.createServer((socket) => {
            let buffer = '';
            socket.on('data', (data) => {
                buffer += data.toString();
                const parts = buffer.split('\n');
                buffer = parts.pop();
                for (const part of parts) {
                    if (!part.trim()) {continue;}
                    try {
                        const msg = JSON.parse(part);
                        this._handleMessage(socket, msg);
                    } catch {
                        socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
                    }
                }
            });
            socket.on('error', () => {});
        });
        return new Promise((resolve) => {
            this.server.listen(this.socketPath, () => {
                try { fs.chmodSync(this.socketPath, 0o600); } catch {
                    // Ignore chmod failures (e.g. on Windows)
                }
                resolve();
            });
        });
    }

    _handleMessage(socket, msg) {
        if (SOCKET_TOKEN) {
            if (msg.token !== SOCKET_TOKEN) {
                socket.write(JSON.stringify({ id: msg.id, error: 'Unauthorized' }) + '\n');
                return;
            }
        }
        const { command, args, id } = msg;
        const handler = this.pluginManager.getSocketHandler(command);
        if (!handler) {
            socket.write(JSON.stringify({ id, error: `Unknown command: ${command}` }) + '\n');
            return;
        }
        Promise.resolve().then(async() => {
            try {
                const result = await handler(this.pluginManager.client, args);
                socket.write(JSON.stringify({ id, result }) + '\n');
            } catch (e) {
                socket.write(JSON.stringify({ id, error: e.message }) + '\n');
            }
        });
    }

    async stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        try { await fs.promises.unlink(this.socketPath); } catch {
            // Ignore if file doesn't exist
        }
    }
}

export { SocketServer, DEFAULT_SOCKET_PATH };
