import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { normalize, isSupported, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../src/i18n/supportedLocales.js';

describe('supportedLocales', () => {
    it('normalizes BCP47 and falls back to en-US', () => {
        expect(normalize('es-ES')).toBe('es-ES');
        expect(normalize('de')).toBe('de');
        expect(normalize('xx-YY')).toBe(DEFAULT_LOCALE);
    });
    it('supports the frozen pilot set', () => {
        expect(isSupported('en-US')).toBe(true);
        expect(isSupported('es-ES')).toBe(true);
        expect(isSupported('de')).toBe(true);
        expect(isSupported('it')).toBe(true);
        expect(isSupported('pl')).toBe(true);
        expect(isSupported('el')).toBe(true);
        expect(isSupported('xx')).toBe(false);
        expect(SUPPORTED_LOCALES).toEqual(['en-US', 'es-ES', 'de', 'it', 'pl', 'el']);
    });
    it('accepts scope without changing v1 output (C-prep)', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        expect(i18n.t('common:ok', { scope: 'public' })).toBe(i18n.t('common:ok', { scope: 'personal' }));
    });
    it('returns key for missing keys, never throws', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        expect(i18n.t('common:does-not-exist-xyz')).toBe('common:does-not-exist-xyz');
    });
    it('resolves userLocale slot as null in v1 (B-prep)', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        expect(await i18n.resolveLocale({ locale: 'es-ES', userLocale: 'es-ES' })).toBe('es-ES');
    });
});

describe('third-party plugin locales', () => {
    const fixtureDir = new URL('../data/plugins/__i18n_fixture__/locales/en-US/', import.meta.url);

    beforeAll(async () => {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(fixtureDir, { recursive: true });
        await writeFile(new URL('common.json', fixtureDir), JSON.stringify({ 'fixture.hello': 'Hello from fixture' }));
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.loadNamespaces('__i18n_fixture__');
    });

    afterAll(async () => {
        const { rm } = await import('node:fs/promises');
        await rm(new URL('../data/plugins/__i18n_fixture__/', import.meta.url), { recursive: true, force: true });
    });

    it('loads data/plugins locales into the host namespace', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', '__i18n_fixture__')('fixture.hello')).toBe('Hello from fixture');
    });

    it('falls back to English for missing third-party locales', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('de', '__i18n_fixture__')('fixture.hello')).toBe('Hello from fixture');
    });

    it('reloads edited locale files from disk', async () => {
        const { writeFile } = await import('node:fs/promises');
        const { i18n } = await import('../src/i18n/index.js');
        await writeFile(new URL('common.json', fixtureDir), JSON.stringify({ 'fixture.hello': 'Hello again' }));
        await i18n.reloadResources('en-US', '__i18n_fixture__');
        expect(i18n.getFixedT('en-US', '__i18n_fixture__')('fixture.hello')).toBe('Hello again');
    });
});

describe('i18n dictionaries', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
    });
    it('translates pilot locales', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.t('common:ok', { lng: 'en-US' })).not.toBe('common:ok');
        expect(i18n.t('common:ok', { lng: 'es-ES' })).not.toBe('common:ok');
        expect(i18n.t('common:ok', { lng: 'de' })).not.toBe('common:ok');
    });
});
