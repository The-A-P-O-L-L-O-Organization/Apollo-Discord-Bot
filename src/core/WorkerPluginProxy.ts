import { createRequest, isResponse, type RPCMessage } from './worker/rpc.js';
import type { CommandModule } from '../types/shared.js';

export interface WorkerProxyChild {
    send(message: RPCMessage): void;
    on(event: string, listener: (msg: unknown) => void): void;
}

export interface WorkerProxyHost {
    send(pluginId: string, message: RPCMessage): boolean;
    getWorker(pluginId: string): { child: WorkerProxyChild } | undefined;
}

export interface WorkerProxyOptions {
    dir?: string;
    version?: string;
    description?: string;
    capabilities?: string[];
    timeoutMs?: number;
}

export interface WorkerRpcResult {
    ok: boolean;
    error?: string;
    [key: string]: unknown;
}

export interface WorkerProxyEvent {
    event: string;
    handler: (...args: unknown[]) => void;
}

export class WorkerUnavailableError extends Error {
    constructor(pluginId: string) {
        super(`No worker running for plugin ${pluginId}`);
        this.name = 'WorkerUnavailableError';
    }
}

interface PendingRequest {
    resolve: (value: WorkerRpcResult) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

const DEFAULT_RPC_TIMEOUT_MS = 30000;

function isOkResult(result: unknown): result is WorkerRpcResult {
    return typeof result === 'object' && result !== null && (result as WorkerRpcResult).ok === true;
}

function resultError(result: unknown): string {
    if (typeof result === 'object' && result !== null && typeof (result as WorkerRpcResult).error === 'string') {
        return (result as WorkerRpcResult).error as string;
    }
    return 'Unknown worker error';
}

export class WorkerPluginProxy {
    public readonly id: string;
    public readonly name: string;
    public readonly version: string;
    public readonly description: string;
    public readonly capabilities: string[];
    public commands: CommandModule[] = [];
    public events: WorkerProxyEvent[] = [];
    public eventHandlers: { name: string; handler: (...args: unknown[]) => void; once: boolean }[] = [];
    public enabled = false;
    public loaded = false;

    private _dir: string | null;
    private workerHost: WorkerProxyHost;
    private timeoutMs: number;
    private pending = new Map<string, PendingRequest>();
    private attachedChild: WorkerProxyChild | undefined;

    constructor(pluginId: string, workerHost: WorkerProxyHost, options: WorkerProxyOptions = {}) {
        this.id = pluginId;
        this.name = pluginId;
        this.version = options.version ?? '1.0.0';
        this.description = options.description ?? '';
        this.capabilities = options.capabilities ?? [];
        this._dir = options.dir ?? null;
        this.workerHost = workerHost;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    }

    setDirectory(dir: string): void {
        this._dir = dir;
    }

    get directory(): string | null {
        return this._dir;
    }

    handleWorkerResponse(msg: unknown): void {
        if (!isResponse(msg)) {
            return;
        }
        const pending = this.pending.get(msg.correlationId);
        if (!pending) {
            return;
        }
        this.pending.delete(msg.correlationId);
        clearTimeout(pending.timer);
        if (isOkResult(msg.result)) {
            pending.resolve(msg.result);
        } else {
            pending.reject(new Error(`Worker RPC failed: ${resultError(msg.result)}`));
        }
    }

    async onLoad(): Promise<void> {
        await this.sendRpc('lifecycle:load', {});
    }

    async onEnable(): Promise<void> {
        await this.sendRpc('lifecycle:enable', {});
    }

    async onDisable(): Promise<void> {
        try {
            await this.sendRpc('lifecycle:disable', {});
        } catch (err) {
            if (!(err instanceof WorkerUnavailableError)) {
                throw err;
            }
        }
    }

    async onUnload(): Promise<void> {
        try {
            await this.sendRpc('lifecycle:unload', {});
        } catch (err) {
            if (!(err instanceof WorkerUnavailableError)) {
                throw err;
            }
        }
    }

    async getCommands(): Promise<CommandModule[]> {
        const result = await this.sendRpc('lifecycle:describe', {});
        const remote = result['commands'];
        this.commands.length = 0;
        if (Array.isArray(remote)) {
            this.commands.push(...(remote as CommandModule[]));
        }
        return [...this.commands];
    }

    setCommands(commands: CommandModule[]): void {
        this.commands.length = 0;
        this.commands.push(...commands);
    }

    registerEvent(eventName: string, handler: (...args: unknown[]) => void): void {
        this.workerHost.send(this.id, createRequest(this.id, 'event:register', { event: eventName }));
        this.events.push({ event: eventName, handler });
        this.eventHandlers.push({ name: eventName, handler, once: false });
    }

    async executeCommand(commandName: string, interaction: unknown): Promise<WorkerRpcResult> {
        return this.sendRpc('command:run', { command: commandName, interaction });
    }

    private ensureListening(): WorkerProxyChild | undefined {
        const worker = this.workerHost.getWorker(this.id);
        if (!worker) {
            return undefined;
        }
        if (this.attachedChild !== worker.child) {
            this.attachedChild = worker.child;
            worker.child.on('message', (msg: unknown) => {
                this.handleWorkerResponse(msg);
            });
        }
        return worker.child;
    }

    private sendRpc(method: string, payload: unknown): Promise<WorkerRpcResult> {
        const child = this.ensureListening();
        if (!child) {
            return Promise.reject(new WorkerUnavailableError(this.id));
        }
        const request = createRequest(this.id, method, payload);
        return new Promise<WorkerRpcResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(request.correlationId);
                reject(new Error(`RPC ${method} timed out for plugin ${this.id}`));
            }, this.timeoutMs);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
            this.pending.set(request.correlationId, { resolve, reject, timer });
            const delivered = this.workerHost.send(this.id, request);
            if (!delivered) {
                this.pending.delete(request.correlationId);
                clearTimeout(timer);
                reject(new WorkerUnavailableError(this.id));
            }
        });
    }
}
