export const LOCALE_CACHE_TTL_MS = 5 * 60 * 1000;

export const LOCALE_CACHE_MAX_ENTRIES = 5000;

interface CacheEntry {
    value: string;
    expiresAt: number;
}

export class LocaleCache {
    private readonly store = new Map<string, CacheEntry>();

    get(key: string): string | undefined {
        const entry = this.store.get(key);
        if (entry === undefined) {
            return undefined;
        }
        if (Date.now() >= entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }

    set(key: string, value: string): void {
        if (this.store.has(key)) {
            this.store.delete(key);
        }
        this.store.set(key, { value, expiresAt: Date.now() + LOCALE_CACHE_TTL_MS });
        while (this.store.size > LOCALE_CACHE_MAX_ENTRIES) {
            const oldest = this.store.keys().next();
            if (oldest.done === true) {
                break;
            }
            this.store.delete(oldest.value);
        }
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    get size(): number {
        return this.store.size;
    }
}

export const localeCache = new LocaleCache();

export interface InvalidationBus {
    on(event: string, handler: (message: unknown) => Promise<void> | void, pluginId: string): () => void;
    emit(event: string, payload: unknown): Promise<void> | void;
}

let boundBus: InvalidationBus | null = null;

export function getBoundEventBus(): InvalidationBus | null {
    return boundBus;
}

export function subscribeInvalidation(eventBus: InvalidationBus): () => void {
    boundBus = eventBus;
    return eventBus.on('i18n:localeChanged', (message) => {
        const payload = (message as { payload?: { guildId?: unknown } }).payload ?? message;
        const guildId = (payload as { guildId?: unknown }).guildId;
        if (typeof guildId === 'string' && guildId.length > 0) {
            localeCache.delete(guildId);
        }
    }, 'i18n');
}
