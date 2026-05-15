import net from 'net';
import { randomUUID } from 'crypto';

const SOCKET_PATH = '/tmp/apollo.sock';

export async function sendSocketCommand(command, args) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const id = randomUUID();
        let buffer = '';
        const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error('Socket connection timed out'));
        }, 10000);

        socket.connect(SOCKET_PATH, () => {
            socket.write(JSON.stringify({ command, args, id }) + '\n');
        });

        socket.on('data', (data) => {
            buffer += data.toString();
            const parts = buffer.split('\n');
            buffer = parts.pop();
            for (const part of parts) {
                if (!part.trim()) continue;
                try {
                    const msg = JSON.parse(part);
                    if (msg.id === id) {
                        clearTimeout(timeout);
                        socket.destroy();
                        if (msg.error) {
                            reject(new Error(msg.error));
                        } else {
                            resolve(msg.result);
                        }
                    }
                } catch {}
            }
        });

        socket.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
