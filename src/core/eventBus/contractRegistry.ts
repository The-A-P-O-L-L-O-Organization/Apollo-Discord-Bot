import type { ZodType } from 'zod';

export type ContractKind = 'event' | 'rpc' | 'state';

export interface ContractEntry {
    pluginId: string;
    kind: ContractKind;
    name: string;
    schema?: ZodType;
    description?: string;
}

export interface ContractSnapshot {
    contracts: ContractEntry[];
}

export class ContractRegistry {
    private _entries = new Map<string, ContractEntry>();

    private _key(pluginId: string, kind: ContractKind, name: string): string {
        return `${pluginId}:${kind}:${name}`;
    }

    register(entry: ContractEntry): void {
        const key = this._key(entry.pluginId, entry.kind, entry.name);
        if (this._entries.has(key)) {
            throw new Error(`Contract "${key}" is already registered`);
        }
        this._entries.set(key, entry);
    }

    attachSchema(kind: ContractKind, name: string, schema: ZodType): void {
        for (const [key, entry] of this._entries) {
            if (entry.kind === kind && entry.name === name) {
                entry.schema = schema;
                return;
            }
        }
        throw new Error(`Unknown contract: "${kind}:${name}"`);
    }

    get(kind: ContractKind, name: string): ContractEntry | undefined {
        for (const entry of this._entries.values()) {
            if (entry.kind === kind && entry.name === name) {
                return entry;
            }
        }
        return undefined;
    }

    snapshot(): ContractSnapshot {
        const contracts = [...this._entries.values()].sort((a, b) => {
            const keyA = this._key(a.pluginId, a.kind, a.name);
            const keyB = this._key(b.pluginId, b.kind, b.name);
            return keyA.localeCompare(keyB);
        });
        return { contracts };
    }
}
