import { i18n } from '../../i18n/index.js';
import { DEFAULT_LOCALE, isSupported, type SupportedLocale } from '../../i18n/supportedLocales.js';

export function resolveInterlinkLocale(locale: unknown): SupportedLocale {
    if (typeof locale === 'string' && isSupported(locale)) {
        return locale;
    }
    return DEFAULT_LOCALE;
}

export function extractInterlinkLocale(params: unknown): unknown {
    if (typeof params === 'object' && params !== null && !Array.isArray(params)) {
        return (params as Record<string, unknown>)['locale'];
    }
    return undefined;
}

export function translateInterlinkKey(key: string, locale: unknown, vars?: Record<string, string | number | boolean>): string {
    return i18n.t(`common:${key}`, { lng: resolveInterlinkLocale(locale), vars });
}
