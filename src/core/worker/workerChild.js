import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequest, createResponse, isRequest, isResponse, isOversize } from './rpc.js';
import { logger } from '../../utils/logger.js';

export async function runChild({ pluginDir, env, processLike = process, loader }) {
    const loadPlugin = loader || (async() => import(pathToFileURL(join(pluginDir, 'plugin.js')).href + '?t=' + Date.now()));

    const mod = await loadPlugin();
    const PluginClass = mod.default;
    if (!PluginClass || !PluginClass.id) {
        throw new Error('plugin.js must export a class with static id');
    }

    const pending = new Map();

    const host = {
        allowedCapabilities: new Set(JSON.parse(env.PLUGIN_CAPABILITIES || '[]')),
        async call(capability, payload) {
            if (!this.allowedCapabilities.has(capability)) {
                return { ok: false, error: `Capability '${capability}' is not granted.` };
            }
            const request = createRequest(env.PLUGIN_ID, capability, payload);
            if (isOversize(request)) {
                return { ok: false, error: 'Payload exceeds RPC size limit.' };
            }
            return new Promise((resolve) => {
                pending.set(request.correlationId, resolve);
                processLike.send(request);
            });
        }
    };

    const plugin = new PluginClass(host);

    const child = {
        async handleMessage(msg) {
            if (isResponse(msg)) {
                const resolve = pending.get(msg.correlationId);
                if (resolve) {
                    pending.delete(msg.correlationId);
                    resolve(msg.result);
                }
                return;
            }
            if (!isRequest(msg)) {
                return;
            }

            let result;
            try {
                if (msg.method === 'lifecycle:load') {
                    await plugin.onLoad?.();
                    result = { ok: true };
                } else if (msg.method === 'lifecycle:enable') {
                    await plugin.onEnable?.();
                    result = { ok: true };
                } else if (msg.method === 'command:run') {
                    result = await plugin.onCommand?.(msg.payload);
                    if (result === undefined) {
                        result = { ok: true, output: null };
                    }
                } else if (msg.method === 'event:emit') {
                    const handled = await plugin.onEvent?.(msg.payload);
                    result = { ok: true, handled: !!handled };
                } else if (msg.method === 'lifecycle:unload') {
                    await plugin.onUnload?.();
                    result = { ok: true };
                } else {
                    result = { ok: false, error: `Unknown method: ${msg.method}` };
                }
            } catch (err) {
                result = { ok: false, error: err.message };
            }

            const response = createResponse(msg.correlationId, result);
            if (!isOversize(response)) {
                processLike.send(response);
            }
        }
    };

    return child;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const pluginDir = process.env.PLUGIN_DIR;
    runChild({ pluginDir, env: process.env }).then(child => {
        process.on('message', (msg) => child.handleMessage(msg));
    }).catch(err => {
        logger.error('[WORKER] Failed to start:', err);
        process.exit(1);
    });
}
