# src/i18n/

## Responsibility
Internationalization core for 6 supported locales with `en-US` as canonical, resolving per-guild and per-user language for plugin commands and events.

## Files

| File | Purpose |
|---|---|
| `I18nService.ts` | Wraps i18next with fs-backend loading, locale resolution, and fixed translators. |
| `commandPayload.ts` | Builds localized Discord command payloads from locale dictionaries. |
| `index.ts` | Exposes the shared `i18n` singleton and re-exports locale helpers. |
| `localeCache.ts` | LRU cache (5-minute TTL, 5000-entry cap) for resolved translations. |
| `supportedLocales.ts` | Defines `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, and locale normalize/isSupported helpers. |
| `watchLocales.ts` | Watches locale files and reloads translations on change. |

## Design
- `I18nService.ts` wraps i18next with an `i18next-fs-backend` over `dictionaries/<locale>/common.json`; `index.ts` exposes a shared `i18n` singleton.
- `supportedLocales.ts` defines `SUPPORTED_LOCALES` as `en-US`, `es-ES`, `de`, `it`, `pl`, `el` with `DEFAULT_LOCALE`, `isSupported`, and case-insensitive `normalize` with base-language fallback.
- `localeCache.ts` is an LRU cache with 5-minute TTL and 5000-entry cap plus invalidation subscriptions; `watchLocales.ts` and `commandPayload.ts` handle reload and command locale extraction.
- Patterns: Singleton (shared `i18n` instance from `index.ts`), Facade (`I18nService` wrapping i18next plus fs-backend), Observer (cache invalidation subscriptions and locale file watching).

## Flow
1. Service initializes with `lng` and `fallbackLng` set to `en-US`, preloading all supported locales.
2. Callers resolve a locale from interaction, guild setting, or user preference through `normalize`.
3. Translators are fetched with `t('plugin:key')` where namespace equals plugin id, preserving `{{variable}}` placeholders and plural suffixes.
4. Fixed translators are used for concurrent operations to avoid locale leakage; cache entries expire by TTL or invalidation events.

## Integration
- Dictionaries live in `dictionaries/<locale>/common.json` with `en-US` required complete; plugin namespaces map to plugin ids.
- Validated by `pnpm lint:locales`; translator guidance lives in `docs/i18n.md`.
- German user-facing copy uses informal `du`; `tests/setup.ts` initializes i18n and preloads plugin namespaces for Vitest.
