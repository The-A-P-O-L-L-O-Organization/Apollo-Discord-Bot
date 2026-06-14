import * as deepl from 'deepl-node';

class DeepLService {
    constructor(options = {}) {
        const apiKey = process.env.DEEPL_API_KEY;
        if (!apiKey) {
            throw new Error('DEEPL_API_KEY environment variable is not set');
        }
        this.translator = options.translator || new deepl.DeepLClient(apiKey);
        this.cachedLanguages = [];
    }

    async initialize() {
        try {
            const targetLanguages = await this.translator.getTargetLanguages();
            this.cachedLanguages = targetLanguages.map(lang => ({
                language: lang.code,
                name: lang.name,
                supportsFormality: lang.supportsFormality
            }));
            console.log(`[DeepL] Initialized with ${this.cachedLanguages.length} supported languages`);
        } catch (error) {
            console.error('[DeepL] Failed to initialize:', error.message);
            throw error;
        }
    }

    getSupportedLanguages() {
        return this.cachedLanguages;
    }

    setCachedLanguages(languages) {
        this.cachedLanguages = languages;
    }

    validateLanguage(language) {
        return this.normalizeLanguageCode(language) !== null;
    }

    normalizeLanguageCode(language) {
        if (!language) return null;
        const upperLang = language.toUpperCase();

        const codeMatch = this.cachedLanguages.find(lang => lang.language === upperLang);
        if (codeMatch) return codeMatch.language;

        const nameMatch = this.cachedLanguages.find(lang =>
            lang.name.toUpperCase() === upperLang
        );
        if (nameMatch) return nameMatch.language;

        return null;
    }

    async translate(text, targetLanguage) {
        if (!text || text.trim().length === 0) {
            throw new Error('Text to translate cannot be empty');
        }

        const normalizedTarget = targetLanguage
            ? this.normalizeLanguageCode(targetLanguage)
            : 'EN';

        if (!normalizedTarget) {
            throw new Error(`Unsupported language: ${targetLanguage}. Available: ${this.getAvailableLanguagesString()}`);
        }

        try {
            const result = await this.translator.translateText(
                text,
                null,
                normalizedTarget
            );

            const sourceLangName = this.getLanguageName(result.detectedSourceLanguage) || result.detectedSourceLanguage;
            const targetLangName = this.getLanguageName(normalizedTarget) || normalizedTarget;

            return {
                original: text,
                translated: result.text,
                sourceLang: result.detectedSourceLanguage,
                targetLang: normalizedTarget,
                sourceLangName,
                targetLangName
            };
        } catch (error) {
            if (error.message.includes('429')) {
                throw new Error('Too many translation requests. Please wait a moment.');
            }
            if (error.message.includes('403')) {
                throw new Error('DeepL API authentication failed. Check DEEPL_API_KEY.');
            }
            throw new Error(`Translation failed: ${error.message}`);
        }
    }

    getLanguageName(code) {
        if (!code) return null;
        const upperCode = code.toUpperCase();
        const lang = this.cachedLanguages.find(l => l.language === upperCode);
        return lang ? lang.name : null;
    }

    getAvailableLanguagesString() {
        return this.cachedLanguages
            .map(lang => `${lang.name} (${lang.language})`)
            .join(', ');
    }
}

export default DeepLService;
