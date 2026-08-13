import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import TranslationService from '../../../src/utils/translation.js';

describe('TranslationService', () => {
    let service;
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        service = new TranslationService({ baseUrl: 'https://test.instance.com' });
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    describe('constructor', () => {
        it('should use provided baseUrl', () => {
            const svc = new TranslationService({ baseUrl: 'https://custom.url' });
            expect(svc.baseUrl).toBe('https://custom.url');
        });

        it('should default baseUrl from env when not provided', () => {
            process.env.TRANSLATION_API_BASE_URL = 'https://env.url';
            const svc = new TranslationService();
            expect(svc.baseUrl).toBe('https://env.url');
            delete process.env.TRANSLATION_API_BASE_URL;
        });
    });

    describe('initialize', () => {
        it('should fetch and cache supported languages', async() => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve([
                    { code: 'en', name: 'English' },
                    { code: 'es', name: 'Spanish' },
                    { code: 'fr', name: 'French' }
                ])
            });

            await service.initialize();

            expect(fetchMock).toHaveBeenCalledWith('https://test.instance.com/languages', expect.objectContaining({ signal: expect.any(AbortSignal) }));
            expect(service.getSupportedLanguages()).toEqual([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' },
                { language: 'FR', name: 'French' }
            ]);
        });

        it('should throw on fetch failure', async() => {
            fetchMock.mockRejectedValue(new Error('Network error'));
            await expect(service.initialize()).rejects.toThrow('Network error');
        });

        it('should throw on non-ok response', async() => {
            fetchMock.mockResolvedValue({ ok: false, status: 500 });
            await expect(service.initialize()).rejects.toThrow('Failed to fetch languages');
        });
    });

    describe('validateLanguage', () => {
        beforeEach(() => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' }
            ]);
        });

        it('should accept valid language codes', () => {
            expect(service.validateLanguage('en')).toBe(true);
            expect(service.validateLanguage('EN')).toBe(true);
            expect(service.validateLanguage('es')).toBe(true);
        });

        it('should accept valid language names', () => {
            expect(service.validateLanguage('English')).toBe(true);
            expect(service.validateLanguage('english')).toBe(true);
            expect(service.validateLanguage('Spanish')).toBe(true);
        });

        it('should reject invalid languages', () => {
            expect(service.validateLanguage('InvalidLang')).toBe(false);
        });

        it('should reject empty input', () => {
            expect(service.validateLanguage('')).toBe(false);
            expect(service.validateLanguage(null)).toBe(false);
            expect(service.validateLanguage(undefined)).toBe(false);
        });
    });

    describe('normalizeLanguageCode', () => {
        beforeEach(() => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' },
                { language: 'FR', name: 'French' }
            ]);
        });

        it('should convert language name to code', () => {
            expect(service.normalizeLanguageCode('English')).toBe('EN');
            expect(service.normalizeLanguageCode('english')).toBe('EN');
            expect(service.normalizeLanguageCode('es')).toBe('ES');
        });

        it('should return uppercase for code input', () => {
            expect(service.normalizeLanguageCode('en')).toBe('EN');
            expect(service.normalizeLanguageCode('EN')).toBe('EN');
        });

        it('should return null for invalid input', () => {
            expect(service.normalizeLanguageCode('InvalidLang')).toBeNull();
            expect(service.normalizeLanguageCode('')).toBeNull();
            expect(service.normalizeLanguageCode(null)).toBeNull();
        });
    });

    describe('getLanguageName', () => {
        beforeEach(() => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'FR', name: 'French' }
            ]);
        });

        it('should return name for valid code', () => {
            expect(service.getLanguageName('EN')).toBe('English');
            expect(service.getLanguageName('fr')).toBe('French');
        });

        it('should return null for unknown code', () => {
            expect(service.getLanguageName('XX')).toBeNull();
        });
    });

    describe('translate', () => {
        beforeEach(() => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' },
                { language: 'FR', name: 'French' },
                { language: 'DE', name: 'German' }
            ]);
        });

        it('should throw for empty text', async() => {
            await expect(service.translate('', 'ES')).rejects.toThrow('empty');
            await expect(service.translate('   ', 'ES')).rejects.toThrow('empty');
        });

        it('should throw for unsupported target language', async() => {
            await expect(service.translate('Hello', 'XX')).rejects.toThrow('Unsupported language');
        });

        it('should detect source and translate text', async() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve([{ language: 'en', confidence: 98 }])
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ translatedText: 'Hola' })
                });

            const result = await service.translate('Hello', 'ES');

            expect(result).toEqual({
                original: 'Hello',
                translated: 'Hola',
                sourceLang: 'EN',
                targetLang: 'ES',
                sourceLangName: 'English',
                targetLangName: 'Spanish'
            });

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(fetchMock.mock.calls[0][0]).toBe('https://test.instance.com/detect');
            expect(fetchMock.mock.calls[1][0]).toBe('https://test.instance.com/translate');
        });

        it('should handle detect failure gracefully', async() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ translatedText: 'Bonjour' })
                });

            const result = await service.translate('Hello', 'FR');

            expect(result.sourceLang).toBe('auto');
            expect(result.sourceLangName).toBe('Auto-detected');
            expect(result.translated).toBe('Bonjour');
        });

        it('should throw on translate API error', async() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve([{ language: 'en', confidence: 98 }])
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    json: () => Promise.resolve({ error: 'Too many requests' })
                });

            await expect(service.translate('Hello', 'ES')).rejects.toThrow('Too many translation requests');
        });

        it('should include api_key in requests when configured', async() => {
            process.env.TRANSLATION_API_KEY = 'test-key';
            const svc = new TranslationService({ baseUrl: 'https://test.instance.com' });
            svc.setCachedLanguages([{ language: 'EN', name: 'English' }, { language: 'ES', name: 'Spanish' }]);

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve([{ language: 'en', confidence: 98 }])
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ translatedText: 'Hola' })
                });

            await svc.translate('Hello', 'ES');

            const detectBody = JSON.parse(fetchMock.mock.calls[0][1].body);
            const translateBody = JSON.parse(fetchMock.mock.calls[1][1].body);
            expect(detectBody.api_key).toBe('test-key');
            expect(translateBody.api_key).toBe('test-key');

            delete process.env.TRANSLATION_API_KEY;
        });
    });

    describe('getAvailableLanguagesString', () => {
        it('should return formatted string of available languages', () => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'FR', name: 'French' }
            ]);
            expect(service.getAvailableLanguagesString()).toBe('English (EN), French (FR)');
        });
    });
});
