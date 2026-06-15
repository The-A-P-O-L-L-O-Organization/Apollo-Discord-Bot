import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import DeepLService from '../../../src/utils/deepl.js';

describe('DeepLService', () => {
    let service;
    let originalApiKey;

    beforeAll(() => {
        originalApiKey = process.env.DEEPL_API_KEY;
        process.env.DEEPL_API_KEY = 'test-key-1234567890';
    });

    afterAll(() => {
        if (originalApiKey === undefined) {
            delete process.env.DEEPL_API_KEY;
        } else {
            process.env.DEEPL_API_KEY = originalApiKey;
        }
    });

    beforeEach(() => {
        process.env.DEEPL_API_KEY = 'test-key-1234567890';
        service = new DeepLService();
    });

    describe('constructor', () => {
        it('should throw if DEEPL_API_KEY is not set', () => {
            delete process.env.DEEPL_API_KEY;
            expect(() => new DeepLService()).toThrow('DEEPL_API_KEY');
        });
    });

    describe('validateLanguage', () => {
        it('should accept valid language codes', () => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' }
            ]);
            expect(service.validateLanguage('en')).toBe(true);
            expect(service.validateLanguage('EN')).toBe(true);
            expect(service.validateLanguage('es')).toBe(true);
        });

        it('should accept valid language names', () => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' }
            ]);
            expect(service.validateLanguage('English')).toBe(true);
            expect(service.validateLanguage('english')).toBe(true);
            expect(service.validateLanguage('Spanish')).toBe(true);
        });

        it('should reject invalid languages', () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            expect(service.validateLanguage('InvalidLang')).toBe(false);
        });

        it('should reject empty input', () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            expect(service.validateLanguage('')).toBe(false);
            expect(service.validateLanguage(null)).toBe(false);
            expect(service.validateLanguage(undefined)).toBe(false);
        });
    });

    describe('normalizeLanguageCode', () => {
        it('should convert language name to code', () => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'ES', name: 'Spanish' }
            ]);
            expect(service.normalizeLanguageCode('English')).toBe('EN');
            expect(service.normalizeLanguageCode('english')).toBe('EN');
            expect(service.normalizeLanguageCode('es')).toBe('ES');
        });

        it('should return uppercase for code input', () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            expect(service.normalizeLanguageCode('en')).toBe('EN');
            expect(service.normalizeLanguageCode('EN')).toBe('EN');
        });

        it('should return null for invalid input', () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            expect(service.normalizeLanguageCode('InvalidLang')).toBeNull();
            expect(service.normalizeLanguageCode('')).toBeNull();
            expect(service.normalizeLanguageCode(null)).toBeNull();
        });
    });

    describe('getLanguageName', () => {
        it('should return name for valid code', () => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'FR', name: 'French' }
            ]);
            expect(service.getLanguageName('EN')).toBe('English');
            expect(service.getLanguageName('fr')).toBe('French');
        });

        it('should return null for unknown code', () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            expect(service.getLanguageName('XX')).toBeNull();
        });
    });

    describe('translate', () => {
        it('should throw for empty text', async() => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            await expect(service.translate('', 'EN')).rejects.toThrow('empty');
            await expect(service.translate('   ', 'EN')).rejects.toThrow('empty');
        });

        it('should throw for unsupported target language', async() => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            await expect(service.translate('Hello', 'XX')).rejects.toThrow('Unsupported language');
        });

        it('should return translated text with metadata', async() => {
            const mockTranslator = {
                translateText: vi.fn().mockResolvedValue({
                    text: 'Bonjour',
                    detectedSourceLanguage: 'EN',
                    billedCharacters: 10
                })
            };
            const svc = new DeepLService({ translator: mockTranslator });
            svc.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'FR', name: 'French' }
            ]);
            const result = await svc.translate('Hello', 'FR');
            expect(result).toEqual({
                original: 'Hello',
                translated: 'Bonjour',
                sourceLang: 'EN',
                targetLang: 'FR',
                sourceLangName: 'English',
                targetLangName: 'French'
            });
        });
    });

    describe('initialize', () => {
        it('should populate cachedLanguages from translator', async() => {
            const mockLanguages = [
                { code: 'EN', name: 'English', supportsFormality: false },
                { code: 'FR', name: 'French', supportsFormality: true },
                { code: 'DE', name: 'German', supportsFormality: true }
            ];
            const mockTranslator = {
                getTargetLanguages: vi.fn().mockResolvedValue(mockLanguages)
            };
            const svc = new DeepLService({ translator: mockTranslator });
            await svc.initialize();
            expect(svc.getSupportedLanguages()).toEqual([
                { language: 'EN', name: 'English', supportsFormality: false },
                { language: 'FR', name: 'French', supportsFormality: true },
                { language: 'DE', name: 'German', supportsFormality: true }
            ]);
        });
    });

    describe('getAvailableLanguagesString', () => {
        it('should return formatted string of available languages', () => {
            service.setCachedLanguages([
                { language: 'EN', name: 'English' },
                { language: 'FR', name: 'French' }
            ]);
            const result = service.getAvailableLanguagesString();
            expect(result).toBe('English (EN), French (FR)');
        });
    });
});
