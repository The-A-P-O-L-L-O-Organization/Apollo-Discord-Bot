# 0006: i18n Contract (Namespace=Plugin, en-US Canonical)

> **Status:** Accepted
> **Date:** 2026-09-22
> **Deciders:** Apollo maintainers
> **Technical Story:** [i18n/l10n Implementation Plan](docs/superpowers/plans/2026-09-22-i18n-l10n-implementation-plan.md)

## Context

Apollo supports 6 locales with `en-US` as canonical. Requirements:
- Plugin-localized strings (no global namespace collisions)
- Canonical locale completeness enforcement
- Placeholder/pluralization preservation across locales
- Concurrent request locale isolation (no leakage)

We evaluated:
1. **Custom i18n** — Rejected: reinventing ICU/pluralization; maintenance burden
2. **i18next** — Selected: mature, ICU support, namespace support, TypeScript types, plugin ecosystem

## Decision

We will use **i18next** with the following contract:

- **Namespace = Plugin ID**: `t('moderation:ban.success')` — prevents collisions
- **Canonical locale**: `en-US` must be complete; CI fails if keys missing (`pnpm lint:locales`)
- **Placeholders**: `{{variable}}` preserved exactly across locales; no translation-time interpolation
- **Pluralization**: ICU format preserved; suffixes (`_zero`, `_one`, `_other`) maintained
- **Fixed translators**: `i18n.getFixedT(locale)` for concurrent operations; no global locale mutation
- **German**: Informal `du` (not formal `Sie`) per community preference
- **Locale files**: `src/i18n/<locale>/<plugin>.json` (per-plugin, per-locale)

## Consequences

### Positive
- **Scalable**: Adding plugin = adding locale files; no core changes
- **Validator**: `pnpm lint:locales` catches missing keys, placeholder drift, pluralization issues
- **Concurrency safe**: Fixed translators prevent locale leakage in async handlers
- **Standards-based**: ICU pluralization; industry-standard tooling

### Negative
- **Bundle size**: i18next + locales adds ~50KB (acceptable)
- **Translation workflow**: Manual JSON editing; no integrated translation management

### Neutral / Risks
- **Key drift**: New keys added to `en-US` must propagate to 5 other locales; CI enforces
- **Pluralization complexity**: Some languages have 6+ forms; ICU handles but translators must know

## References

- Implementation: `src/i18n/`, `src/utils/i18n.ts` (fixedT helper)
- Config: `docs/i18n.md` (translator guidance)
- Plans: i18n/l10n Implementation Plan (2026-09-22)
- CI: `pnpm lint:locales` script