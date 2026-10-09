import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequest, createResponse, isRequest, isResponse, isOversize, type RPCMessage } from './rpc.js';
import { logger } from '../../utils/logger.js';
import { verifyCapabilities, type SignedCapabilities } from './capabilitySignature.js';

export interface ChildHost {
    allowedCapabilities: Set<string>;
    call: (capability: string, payload: unknown) => Promise<{ ok: boolean; error?: string; [key: string]: unknown }>;
}

export interface PluginInstance {
    onLoad?: () => Promise<void>;
    onEnable?: () => Promise<void>;
    onDisable?: () => Promise<void>;
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

export interface WorkerTranslationRequest {
    key: string;
    locale?: string;
    ns?: string;
    vars?: Record<string, string | number | boolean>;
    count?: number;
}

export async function requestWorkerTranslation(
    host: Pick<ChildHost, 'call'>,
    request: WorkerTranslationRequest
): Promise<string> {
    const response = await host.call('api:i18n', {
        key: request.key,
        locale: request.locale ?? 'en-US',
        ns: request.ns ?? 'common',
        ...(request.vars !== undefined ? { vars: request.vars } : {}),
        ...(request.count !== undefined ? { count: request.count } : {})
    });
    const text = response['text'];
    if (response.ok === true && typeof text === 'string') {
        return text;
    }
    return request.key;
}

export async function runChild({ pluginDir, env, processLike = process as unknown as ProcessLike, loader }: {
    pluginDir: string;
    env: NodeJS.ProcessEnv;
    processLike?: ProcessLike;
    loader?: () => Promise<{ default: PluginInstance }>;
}): Promise<WorkerChild> {
    const pluginId = env['PLUGIN_ID'] ?? '';
    const capabilitySecret = env['PLUGIN_CAPABILITY_SECRET'] ?? env['QUEUE_HMAC_SECRET'] ?? '';
    if (!capabilitySecret) {
        logger.error({ pluginId }, 'PLUGIN_CAPABILITY_SECRET not provided; refusing to start');
        throw new Error('PLUGIN_CAPABILITY_SECRET not provided; refusing to start');
    }

    let granted: string[];
    try {
        const rawCapabilities: unknown = JSON.parse(env['PLUGIN_CAPABILITIES'] ?? '{}');
        if (rawCapabilities === null || typeof rawCapabilities !== 'object') {
            throw new Error('Invalid signed capabilities format');
        }
        const verified = verifyCapabilities(rawCapabilities as SignedCapabilities, capabilitySecret);
        if (verified.pluginId !== env['PLUGIN_ID']) {
            throw new Error('Plugin ID mismatch in capability signature');
        }
        granted = verified.capabilities;
    } catch (err) {
        logger.error({ pluginId, err }, 'Failed to verify capabilities; refusing to start');
        throw new Error(`Invalid capability signature: ${err instanceof Error ? err.message : String(err)}`);
    }

    const loadPlugin = loader ?? (async () => import(pathToFileURL(join(pluginDir, 'plugin.js')).href + '?t=' + Date.now()));

    const mod = await loadPlugin();
    const PluginClass = mod.default as unknown as { id?: unknown; new (host: ChildHost): PluginInstance };
    if (!PluginClass || typeof PluginClass.id !== 'string' || PluginClass.id.length === 0) {
        throw new Error('plugin.js must export a class with static id');
    }

    const pending = new Map<string, (result: { ok: boolean; error?: string; [key: string]: unknown }) => void>();

    const host: ChildHost = {
        allowedCapabilities: new Set<string>(granted),
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

    processLike.send({ type: 'lifecycle:ready', pluginId: env['PLUGIN_ID'] ?? '' });

    const child: WorkerChild = {
        async handleMessage(msg: RPCMessage) {
            if (typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'debug:execArgv') {
                const requestId = (msg as { requestId?: unknown }).requestId;
                if (typeof requestId === 'number' || typeof requestId === 'string') {
                    processLike.send({ type: 'rpc:response', requestId, data: { execArgv: process.execArgv } });
                }
                return;
            }
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
                } else if (msg.method === 'lifecycle:disable') {
                    await plugin.onDisable?.();
                    result = { ok: true };
                } else if (msg.method === 'lifecycle:describe') {
                    const exposed = (plugin as unknown as { commands?: unknown }).commands;
                    result = { ok: true, commands: Array.isArray(exposed) ? exposed : [] };
                } else if (msg.method === 'event:register') {
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
        process.on('message', (msg) => { void child.handleMessage(msg as RPCMessage); });
    }).catch(err => {
        logger.error({ err: err as Error, msg: '[WORKER] Failed to start' });
        process.exit(1);
    });
}

export default { runChild };