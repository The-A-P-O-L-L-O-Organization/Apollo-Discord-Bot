import { runChild } from '../../../src/core/worker/workerChild.js';
import type { RPCMessage } from '../../../src/core/worker/rpc.js';

const pluginDir = process.env['PLUGIN_DIR'];
runChild({ pluginDir: pluginDir!, env: process.env }).then(child => {
    process.on('message', (msg) => child.handleMessage(msg as RPCMessage));
}).catch(err => {
    console.error('[WORKER] Failed to start:', err);
    process.exit(1);
});
