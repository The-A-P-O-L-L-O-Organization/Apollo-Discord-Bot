import net from 'net';
import fs from 'fs';

const SOCKET_PATH = '/tmp/apollo.sock';

class SocketServer {
    constructor(pluginManager) {
        this.pluginManager = pluginManager;
        this.server = null;
    }

    async start() {
        try { await fs.promises.unlink(SOCKET_PATH); } catch {}
        this.server = net.createServer((socket) => {
            let buffer = '';
            socket.on('data', (data) => {
                buffer += data.toString();
                const parts = buffer.split('\n');
                buffer = parts.pop();
                for (const part of parts) {
                    if (!part.trim()) continue;
                    try {
                        const msg = JSON.parse(part);
                        this._handleMessage(socket, msg);
                    } catch (e) {
                        socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
                    }
                }
            });
            socket.on('error', () => {});
        });
        return new Promise((resolve) => {
            this.server.listen(SOCKET_PATH, resolve);
        });
    }

    _handleMessage(socket, msg) {
        const { command, args, id } = msg;
        const handler = this.pluginManager.getSocketHandler(command);
        if (!handler) {
            socket.write(JSON.stringify({ id, error: `Unknown command: ${command}` }) + '\n');
            return;
        }
        Promise.resolve().then(async () => {
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
        try { await fs.promises.unlink(SOCKET_PATH); } catch {}
    }
}

export { SocketServer, SOCKET_PATH };
