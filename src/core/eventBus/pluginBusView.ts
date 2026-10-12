import type { ZodType } from 'zod';
import type { EventHandler, PublishOptions, SubscribeOptions } from '../../types/eventbus.js';
import type { EventBusImpl } from '../EventBus.js';
import type { RpcMeta } from './rpcRegistry.js';
import type { ContractRegistry } from './contractRegistry.js';

export const DEFAULT_RPC_TIMEOUT_MS = 5000;

export class PluginBusView {
    private _bus: EventBusImpl;
    private _pluginId: string;
    private _contracts: ContractRegistry;
    private _disposed = false;

    constructor(bus: EventBusImpl, pluginId: string, contracts: ContractRegistry) {
        this._bus = bus;
        this._pluginId = pluginId;
        this._contracts = contracts;
    }

    get pluginId(): string {
        return this._pluginId;
    }

    private _assertNotDisposed(): void {
        if (this._disposed) {
            throw new Error(`PluginBusView for "${this._pluginId}" is disposed`);
        }
    }

    private _isOwnNamespace(event: string): boolean {
        return event.startsWith(`${this._pluginId}:`) && event.length > this._pluginId.length + 1;
    }

    private _assertRegistrableEvent(event: string): void {
        if (this._isOwnNamespace(event) || !event.includes(':')) {
            return;
        }
        throw new Error(`Plugin "${this._pluginId}" cannot subscribe to foreign namespace event "${event}"`);
    }

    private _assertEmittableEvent(event: string): void {
        if (!this._isOwnNamespace(event)) {
            throw new Error(`Event "${event}" must be namespaced to "${this._pluginId}"`);
        }
    }

    on(event: string, handler: EventHandler, options?: SubscribeOptions & { schema?: ZodType }): () => void {
        this._assertNotDisposed();
        this._assertRegistrableEvent(event);
        this._contracts.register({ pluginId: this._pluginId, kind: 'event', name: event, schema: options?.schema });
        const { schema: _schema, ...rest } = options ?? {};
        return this._bus.on(event, handler, this._pluginId, Object.keys(rest).length > 0 ? rest : undefined);
    }

    once(event: string, handler: EventHandler): () => void {
        this._assertNotDisposed();
        this._assertRegistrableEvent(event);
        this._contracts.register({ pluginId: this._pluginId, kind: 'event', name: event });
        return this._bus.once(event, handler, this._pluginId);
    }

    async emit<T = unknown>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        this._assertNotDisposed();
        this._assertEmittableEvent(event);
        const contract = this._contracts.get('event', event);
        if (contract?.schema) {
            const result = contract.schema.safeParse(payload);
            if (!result.success) {
                throw new Error(`Schema validation failed for event "${event}"`);
            }
        }
        await this._bus.emit(event, payload, options);
    }

    provide(ns: string, handler: (...args: unknown[]) => Promise<unknown>, meta?: RpcMeta): void {
        this._assertNotDisposed();
        const namespace = `${this._pluginId}:${ns}`;
        this._contracts.register({ pluginId: this._pluginId, kind: 'rpc', name: namespace, description: meta?.description });
        this._bus.provide(namespace, handler, this._pluginId, meta);
    }

    async call<T = unknown>(ns: string, ...args: unknown[]): Promise<T> {
        this._assertNotDisposed();
        const namespace = `${this._pluginId}:${ns}`;
        const entry = this._bus.rpcEntryFor(namespace);
        const timeoutMs = entry?.meta?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
        return this._bus.callWithTimeout<T>(namespace, timeoutMs, this._pluginId, ...args);
    }

    state(key: string): {
        get<T>(): T | undefined;
        set<T>(value: T): Promise<void>;
        watch(fn: (next: unknown, prev: unknown) => void): () => void;
        provide<T>(defaultValue: T, ttlMs?: number): void;
    } {
        this._assertNotDisposed();
        const fullKey = `${this._pluginId}:${key}`;
        if (!this._contracts.get('state', fullKey)) {
            this._contracts.register({ pluginId: this._pluginId, kind: 'state', name: fullKey });
        }
        return {
            get: <T>() => { this._assertNotDisposed(); return this._bus.getState<T>(fullKey); },
            set: async <T>(value: T) => { this._assertNotDisposed(); await this._bus.setState(fullKey, value); },
            watch: (fn: (next: unknown, prev: unknown) => void) => { this._assertNotDisposed(); return this._bus.watchState(fullKey, fn, this._pluginId); },
            provide: <T>(defaultValue: T, ttlMs?: number) => { this._assertNotDisposed(); this._bus.provideStateWithTtl(fullKey, defaultValue, this._pluginId, ttlMs); }
        };
    }

    dispose(): void {
        if (this._disposed) { return; }
        this._disposed = true;
        this._bus.removeAll(this._pluginId);
    }
}
