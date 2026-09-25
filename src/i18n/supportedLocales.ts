export const SUPPORTED_LOCALES = ['en-US', 'es-ES', 'de', 'it', 'pl', 'el'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

const CANONICAL = new Map<string, SupportedLocale>(
    SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale])
);

export function isSupported(code: string | null | undefined): code is SupportedLocale {
    if (typeof code !== 'string' || code.length === 0) {
        return false;
    }
    return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

export function normalize(code: string | null | undefined): SupportedLocale {
    if (typeof code !== 'string' || code.length === 0) {
        return DEFAULT_LOCALE;
    }
    const exact = CANONICAL.get(code.toLowerCase());
    if (exact !== undefined) {
        return exact;
    }
    const base = code.split('-')[0]?.toLowerCase() ?? '';
    if (base.length > 0) {
        for (const locale of SUPPORTED_LOCALES) {
            const lower = locale.toLowerCase();
            if (lower === base || lower.startsWith(base + '-')) {
                return locale;
            }
        }
    }
    return DEFAULT_LOCALE;
}
