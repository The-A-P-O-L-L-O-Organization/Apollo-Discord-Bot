import { runChild } from '../../../src/core/worker/workerChild.js';
import { pathToFileURL } from 'node:url';

const pluginDir = process.env.PLUGIN_DIR;
runChild({ pluginDir, env: process.env }).then(child => {
    process.on('message', (msg) => child.handleMessage(msg));
}).catch(err => {
    console.error('[WORKER] Failed to start:', err);
    process.exit(1);
});
