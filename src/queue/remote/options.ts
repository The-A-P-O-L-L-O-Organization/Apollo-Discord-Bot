import { Collection } from 'discord.js';

export class RemoteOptions {
    _data: { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[];
    _resolved: {
        channels?: Record<string, Record<string, unknown>>;
        roles?: Record<string, Record<string, unknown>>;
        users?: Record<string, Record<string, unknown>>;
        members?: Record<string, Record<string, unknown>>;
    } | null;
    data: { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[];

    constructor(optionsData: { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[] = [], resolved: Record<string, unknown> | null = null) {
        this._data = optionsData || [];
        this._resolved = resolved;
        this.data = this._data;
    }

    getString(name: string): string | null { return this._find(name)?.value as string ?? null; }
    getInteger(name: string): number | null { const v = this._find(name)?.value; return v !== null && v !== undefined ? parseInt(v as string, 10) : null; }
    getBoolean(name: string): boolean | null { const v = this._find(name)?.value; return v !== null && v !== undefined ? Boolean(v) : null; }
    getNumber(name: string): number | null { const v = this._find(name)?.value; return v !== null && v !== undefined ? Number(v) : null; }
    getChannel(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt?.value) { return null; }
        return this._resolved?.channels?.[opt.value as string] ?? { id: opt.value, name: opt.value };
    }
    getRole(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt?.value) { return null; }
        return this._resolved?.roles?.[opt.value as string] ?? { id: opt.value, name: opt.value };
    }
    getUser(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt?.value) { return null; }
        return this._resolved?.users?.[opt.value as string] ?? { id: opt.value, username: opt.value };
    }
    getMember(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt?.value) { return null; }
        const resolvedUser = this._resolved?.users?.[opt.value as string];
        const resolvedMember = this._resolved?.members?.[opt.value as string];
        if (resolvedUser) {
            return { ...resolvedUser, ...resolvedMember!, roles: { cache: new Collection() } };
        }
        return { id: opt.value };
    }
    getMessage(name: string): unknown { const opt = this._find(name); return opt?.value ?? null; }
    getSubcommand(): string | null {
        const sub = this._data.find(o => o.type === 1 || o.type === 2);
        return sub?.name ?? null;
    }
    getSubcommandGroup(): string | null {
        const group = this._data.find(o => o.type === 2);
        return group?.name ?? null;
    }
    getFocused(): { name: string; value: unknown; type: number } | null {
        const focused = this._data.find(o => o.focused);
        return focused ? { name: focused.name, value: focused.value, type: focused.type } : null;
    }

    _find(name: string) { return this._data.find(o => o.name === name); }
}
