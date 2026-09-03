import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequest, createResponse, isRequest, isResponse, isOversize, type RPCRequest, type RPCResponse, type RPCMessage } from './rpc.js';
import { logger } from '../../utils/logger.js';

export interface ChildHost {
    allowedCapabilities: Set<string>;
    call: (capability: string, payload: unknown) => Promise<{ ok: boolean; error?: string; [key: string]: unknown }>;
}

export interface PluginInstance {
    onLoad?: () => Promise<void>;
    onEnable?: () => Promise<void>;
    onUnload?: () => Promise<void>;
    onCommand?: (payload: unknown) => Promise<{ ok: boolean; output?: unknown } | undefined>;
    onEvent?: (payload: unknown) => Promise<boolean>;
    constructor: { id: string };
}

export interface WorkerChild {
    handleMessage: (msg: RPCMessage) => Promise<void>;
}

interface ProcessLike {
    send: (msg: unknown) => void;
    on: (event: string, listener: (msg: unknown) => void) => void;
}

export async function runChild({ pluginDir, env, processLike = process as unknown as ProcessLike, loader }: {
    pluginDir: string;
    env: NodeJS.ProcessEnv;
    processLike?: ProcessLike;
    loader?: () => Promise<{ default: PluginInstance }>;
}): Promise<WorkerChild> {
    const loadPlugin = loader || (async () => import(pathToFileURL(join(pluginDir, 'plugin.js')).href + '?t=' + Date.now()));

    const mod = await loadPlugin();
    const PluginClass = mod.default;
    if (!PluginClass || !PluginClass.constructor.id) {
        throw new Error('plugin.js must export a class with static id');
    }

    const pending = new Map<string, (result: { ok: boolean; error?: string; [key: string]: unknown }) => void>();

    const host: ChildHost = {
        allowedCapabilities: new Set(JSON.parse(env['PLUGIN_CAPABILITIES'] || '[]')),
        async call(capability: string, payload: unknown) {
            if (!this.allowedCapabilities.has(capability)) {
                return { ok: false, error: `Capability '${capability}' is not granted.` };
            }
            const request = createRequest(env['PLUGIN_ID'] ?? '', capability, payload);
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

    const child: WorkerChild = {
        async handleMessage(msg: RPCMessage) {
            if (isResponse(msg)) {
                const resolve = pending.get(msg.correlationId);
                if (resolve) {
                    pending.delete(msg.correlationId);
                    resolve(msg.result as { ok: boolean; error?: string; [key: string]: unknown });
                }
                return;
            }
            if (!isRequest(msg)) {
                return;
            }

            let result: { ok: boolean; error?: string; [key: string]: unknown };
            try {
                if (msg.method === 'lifecycle:load') {
                    await plugin.onLoad?.();
                    result = { ok: true };
                } else if (msg.method === 'lifecycle:enable') {
                    await plugin.onEnable?.();
                    result = { ok: true };
                } else if (msg.method === 'command:run') {
                    const commandResult = await plugin.onCommand?.(msg.payload);
                    result = commandResult ?? { ok: true, output: null };
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
                result = { ok: false, error: err instanceof Error ? err.message : String(err) };
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
    const pluginDir = process.env['PLUGIN_DIR'];
    if (!pluginDir) {
        logger.error('[WORKER] PLUGIN_DIR not set');
        process.exit(1);
    }
    runChild({ pluginDir, env: process.env }).then(child => {
        process.on('message', (msg) => child.handleMessage(msg as RPCMessage));
    }).catch(err => {
        logger.error('[WORKER] Failed to start:', err);
        process.exit(1);
    });
}

export default { runChild };