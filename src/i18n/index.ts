import { I18nService } from './I18nService.js';

export const i18n = new I18nService();

export { I18nService } from './I18nService.js';
export type { Scope, TOptions, ResolveLocaleOptions, InteractionLike } from './I18nService.js';
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, normalize, isSupported } from './supportedLocales.js';
export type { SupportedLocale } from './supportedLocales.js';
export { localeCache, LocaleCache, LOCALE_CACHE_TTL_MS, LOCALE_CACHE_MAX_ENTRIES, subscribeInvalidation, getBoundEventBus } from './localeCache.js';
export type { InvalidationBus } from './localeCache.js';
