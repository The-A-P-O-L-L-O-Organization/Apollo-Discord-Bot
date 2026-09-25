import { describe, it, expect } from 'vitest';
import {
    checkAddedVars,
    checkParity,
    checkEmpty,
    checkInterpolation,
    checkSourceCoverage,
    collectSourceKeys,
    isExcludedFromManifest,
    loadLocaleTree
} from '../scripts/lint-locales.mjs';

describe('locale lint parity', () => {
    it('fails when a de key is missing', () => {
        const errors = checkParity({
            'en-US': { hello: 'Hello', bye: 'Bye' },
            'es-ES': { hello: 'Hola', bye: 'Adios' },
            de: { hello: 'Hallo' }
        });
        expect(errors.some((e: string) => e.includes('bye') && e.includes('de'))).toBe(true);
    });

    it('passes when all locales share the same keys', () => {
        const errors = checkParity({
            'en-US': { hello: 'Hello' },
            'es-ES': { hello: 'Hola' },
            de: { hello: 'Hallo' }
        });
        expect(errors).toEqual([]);
    });
});

describe('locale lint empty values', () => {
    it('fails on empty or whitespace-only values', () => {
        const errors = checkEmpty({
            'en-US': { hello: 'Hello' },
            'es-ES': { hello: '   ' },
            de: { hello: '' }
        });
        expect(errors.length).toBe(2);
    });
});

describe('locale lint interpolation', () => {
    it('fails on uninterpolated single-brace placeholders', () => {
        const errors = checkInterpolation(
            { greet: 'Hello {{name}}, you have {count} messages' },
            { greet: 'Hola {{name}}, tienes {count} mensajes' },
            'es-ES'
        );
        expect(errors.some((e: string) => e.includes('{count}'))).toBe(true);
    });

    it('fails when a translation drops a double-brace variable', () => {
        const errors = checkInterpolation(
            { greet: 'Hello {{name}}' },
            { greet: 'Hallo' },
            'de'
        );
        expect(errors.some((e: string) => e.includes('{{name}}'))).toBe(true);
    });

    it('warns when a translation adds a double-brace variable', () => {
        const warnings = checkAddedVars(
            { greet: 'Hello' },
            { greet: 'Hallo {{name}}' },
            'de'
        );
        expect(warnings.some((e: string) => e.includes('{{name}}'))).toBe(true);
    });

    it('allows legacy single-brace config-mirror templates', () => {
        const errors = checkInterpolation(
            { 'welcome.message': 'Welcome {user} to {server}!' },
            { 'welcome.message': 'Willkommen {user} auf {server}!' },
            'de'
        );
        expect(errors).toEqual([]);
    });

    it('passes when placeholder sets match', () => {
        const errors = checkInterpolation(
            { greet: 'Hello {{name}}' },
            { greet: 'Hallo {{name}}' },
            'de'
        );
        expect(errors).toEqual([]);
    });
});

describe('locale lint source extraction', () => {
    it('fails when a source literal key is missing from en-US dictionaries', () => {
        const files = collectSourceKeys([
            {
                path: 'src/plugins/utility/commands/fake.ts',
                content: "const t = i18n.getFixedT(resolvedLocale, 'utility');\nawait interaction.reply(t('fake.missingKey'));"
            }
        ]);
        const errors = checkSourceCoverage(files, { utility: { 'fake.other': 'Other' }, common: {} });
        expect(errors.some((e: string) => e.includes('fake.missingKey'))).toBe(true);
    });

    it('passes when source literal keys exist in en-US dictionaries', () => {
        const files = collectSourceKeys([
            {
                path: 'src/plugins/utility/commands/fake.ts',
                content: "const t = i18n.getFixedT(resolvedLocale, 'utility');\nawait interaction.reply(t('fake.present'));"
            }
        ]);
        const errors = checkSourceCoverage(files, { utility: { 'fake.present': 'Present' }, common: {} });
        expect(errors).toEqual([]);
    });
});

describe('manifest locales exclusion', () => {
    it('excludes locales paths from integrity hashing', async () => {
        const { readFile } = await import('node:fs/promises');
        const source = await readFile(new URL('../scripts/generate-manifest.mjs', import.meta.url), 'utf8');
        expect(source.includes('locales')).toBe(true);
        expect(isExcludedFromManifest('src/plugins/utility/locales/de/common.json')).toBe(true);
        expect(isExcludedFromManifest('src/plugins/utility/commands/ping.ts')).toBe(false);
    });
});

describe('real locale tree', () => {
    it('has zero parity, empty, and interpolation errors', async () => {
        const tree = await loadLocaleTree(new URL('../', import.meta.url));
        const errors: string[] = [];
        for (const bundle of tree) {
            errors.push(...checkParity(bundle.locales));
            errors.push(...checkEmpty({ 'en-US': bundle.locales['en-US'] ?? {} }, bundle.label));
            const canonical = bundle.locales['en-US'] ?? {};
            for (const [lng, dict] of Object.entries(bundle.locales)) {
                if (lng === 'en-US') {
                    continue;
                }
                const filled = Object.fromEntries(Object.entries(dict as Record<string, string>).filter(([, value]) => typeof value === 'string' && value.trim().length > 0));
                errors.push(...checkInterpolation(canonical, filled, `${bundle.label}:${lng}`));
            }
        }
        expect(errors).toEqual([]);
    });
});
