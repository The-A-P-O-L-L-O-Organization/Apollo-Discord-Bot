import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18next, { type i18n as I18nInstance, type TFunction } from 'i18next';
import Backend from 'i18next-fs-backend';
import { DEFAULT_LOCALE, isSupported, normalize, SUPPORTED_LOCALES } from './supportedLocales.js';
import { localeCache } from './localeCache.js';

export type Scope = 'personal' | 'public';

export interface TOptions {
    lng?: string;
    vars?: Record<string, string | number | boolean>;
    count?: number;
    scope?: Scope;
    defaultValue?: string;
}

export interface ResolveLocaleOptions {
    locale?: string | null;
    guildLocale?: string | null;
    guildId?: string | null;
    userLocale?: string | null;
}

export interface InteractionLike {
    locale?: string | null;
    guildLocale?: string | null;
    guildId?: string | null;
}

const SETTINGS_STORE = 'settings';
const LOCALE_KEY = 'locale';

export class I18nService {
    private readonly instance: I18nInstance;
    private readonly loadedPluginNamespaces = new Set<string>();
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.instance = i18next.createInstance();
    }

    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }
        if (this.initPromise !== null) {
            await this.initPromise;
            return;
        }
        const moduleDir = path.dirname(fileURLToPath(import.meta.url));
        this.initPromise = this.instance
            .use(Backend)
            .init({
                lng: DEFAULT_LOCALE,
                fallbackLng: DEFAULT_LOCALE,
                preload: [...SUPPORTED_LOCALES],
                ns: ['common'],
                defaultNS: 'common',
                backend: {
                    loadPath: path.join(moduleDir, 'dictionaries/{{lng}}/{{ns}}.json')
                },
                interpolation: {
                    escapeValue: false
                },
                returnEmptyString: false
            })
            .then(() => this.instance.loadLanguages([...SUPPORTED_LOCALES]))
            .then(() => {
                this.initialized = true;
            });
        await this.initPromise;
    }

    t(key: string, opts?: TOptions): string {
        try {
            const lng = opts?.lng !== undefined ? normalize(opts.lng) : DEFAULT_LOCALE;
            const count = opts?.count !== undefined ? { count: opts.count } : {};
            if (!this.instance.exists(key, { lng, ...count })) {
                return opts?.defaultValue ?? key;
            }
            const result = this.instance.t(key, {
                lng,
                ...opts?.vars,
                ...count,
                ...(opts?.defaultValue !== undefined ? { defaultValue: opts.defaultValue } : {})
            });
            if (typeof result !== 'string' || result.length === 0) {
                return opts?.defaultValue ?? key;
            }
            return result;
        } catch {
            return opts?.defaultValue ?? key;
        }
    }

    tFor(interaction: InteractionLike, key: string, opts?: Omit<TOptions, 'lng'>): string {
        let lng: string = DEFAULT_LOCALE;
        if (typeof interaction.guildId === 'string' && interaction.guildId.length > 0) {
            const cached = localeCache.get(interaction.guildId);
            if (cached !== undefined) {
                lng = cached;
            } else {
                lng = normalize(interaction.locale ?? interaction.guildLocale ?? null);
            }
        } else {
            lng = normalize(interaction.locale ?? null);
        }
        return this.t(key, { ...opts, lng });
    }

    getFixedT(lng: string, ns: string): TFunction {
        return this.instance.getFixedT(normalize(lng), ns);
    }

    private readPluginBundle(
        existsSync: (file: string) => boolean,
        readFileSync: (file: string, encoding: 'utf8') => string,
        name: string,
        lng: string
    ): Record<string, unknown> | null {
        const moduleDir = path.dirname(fileURLToPath(import.meta.url));
        const candidates = [
            path.join(moduleDir, '..', 'plugins', name, 'locales', lng, 'common.json'),
            path.join(moduleDir, '..', '..', 'data', 'plugins', name, 'locales', lng, 'common.json')
        ];
        for (const file of candidates) {
            try {
                if (!existsSync(file)) {
                    continue;
                }
                return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
            } catch {
                continue;
            }
        }
        return null;
    }

    async loadNamespaces(ns: string | string[]): Promise<void> {
        await this.init();
        const names = Array.isArray(ns) ? ns : [ns];
        const { existsSync, readFileSync } = await import('node:fs');
        for (const name of names) {
            for (const lng of SUPPORTED_LOCALES) {
                const data = this.readPluginBundle(existsSync, readFileSync, name, lng);
                if (data === null) {
                    continue;
                }
                this.instance.addResourceBundle(lng, name, data, true, true);
                this.loadedPluginNamespaces.add(name);
            }
        }
    }

    async reloadResources(lng?: string | string[], ns?: string | string[]): Promise<void> {
        await this.init();
        const { existsSync, readFileSync } = await import('node:fs');
        const lngs = lng === undefined ? [...SUPPORTED_LOCALES] : (Array.isArray(lng) ? lng : [lng]);
        const names = ns === undefined ? [...this.loadedPluginNamespaces] : (Array.isArray(ns) ? ns : [ns]);
        if (ns === undefined || names.includes('common')) {
            await this.instance.reloadResources(lngs, 'common');
        }
        for (const name of names) {
            if (name === 'common') {
                continue;
            }
            for (const code of lngs) {
                if (this.instance.hasResourceBundle(code, name)) {
                    this.instance.removeResourceBundle(code, name);
                }
                const data = this.readPluginBundle(existsSync, readFileSync, name, code);
                if (data === null) {
                    continue;
                }
                this.instance.addResourceBundle(code, name, data, true, true);
                this.loadedPluginNamespaces.add(name);
            }
        }
    }

    async resolveLocale(opts: ResolveLocaleOptions = {}): Promise<string> {
        if (typeof opts.guildId === 'string' && opts.guildId.length > 0) {
            const stored = await this.readGuildLocale(opts.guildId);
            if (stored !== null) {
                return stored;
            }
        }
        return normalize(opts.locale ?? opts.guildLocale ?? null);
    }

    async getGuildLocale(guildId?: string | null): Promise<string> {
        if (typeof guildId !== 'string' || guildId.length === 0) {
            return DEFAULT_LOCALE;
        }
        const cached = localeCache.get(guildId);
        if (cached !== undefined) {
            return cached;
        }
        const stored = await this.readGuildLocale(guildId);
        const resolved = stored ?? DEFAULT_LOCALE;
        localeCache.set(guildId, resolved);
        return resolved;
    }

    async setGuildLocale(guildId: string, locale: string): Promise<string> {
        const resolved = normalize(locale);
        try {
            const { updateGuildData } = await import('../utils/db.js');
            await updateGuildData(SETTINGS_STORE, guildId, (current) => ({ ...current, [LOCALE_KEY]: resolved }));
            localeCache.set(guildId, resolved);
        } catch {
            localeCache.delete(guildId);
        }
        return resolved;
    }

    getAvailableLocales(): readonly string[] {
        return SUPPORTED_LOCALES;
    }

    private async readGuildLocale(guildId: string): Promise<string | null> {
        try {
            const { getGuildData } = await import('../utils/db.js');
            const data = await getGuildData(SETTINGS_STORE, guildId);
            const raw = data[LOCALE_KEY];
            if (typeof raw !== 'string' || !isSupported(raw)) {
                return null;
            }
            return raw;
        } catch {
            return null;
        }
    }
}
