import { logger } from './utils/logger.js';
/* eslint-disable no-console */
const FETCH_TIMEOUT_MS = 30000;

class TranslationService {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.TRANSLATION_API_BASE_URL || 'https://translate.argosopentech.com';
        if (!this.baseUrl.startsWith('https://')) {
            throw new Error('TRANSLATION_API_BASE_URL must use HTTPS.');
        }
        this.apiKey = options.apiKey || process.env.TRANSLATION_API_KEY || '';
        this.cachedLanguages = [];
    }

    _withTimeout(opts = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        return { ...opts, signal: controller.signal, _timeoutTimer: timer };
    }

    _clearTimeout(opts) {
        if (opts._timeoutTimer) {clearTimeout(opts._timeoutTimer);}
    }

    async initialize() {
        try {
            const opts = this._withTimeout();
            let response;
            try {
                response = await fetch(`${this.baseUrl}/languages`, opts);
            } finally {
                this._clearTimeout(opts);
            }
            if (!response.ok) {
                throw new Error(`Failed to fetch languages: ${response.status}`);
            }
            const languages = await response.json();
            this.cachedLanguages = languages.map(lang => ({
                language: lang.code.toUpperCase(),
                name: lang.name
            }));
            logger.info(`[Translation] Initialized with ${this.cachedLanguages.length} supported languages`);
        } catch (error) {
            logger.error('[Translation] Failed to initialize:', error.message);
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
        if (!language) {return null;}
        const upperLang = language.toUpperCase();

        const codeMatch = this.cachedLanguages.find(lang => lang.language === upperLang);
        if (codeMatch) {return codeMatch.language;}

        const nameMatch = this.cachedLanguages.find(lang =>
            lang.name.toUpperCase() === upperLang
        );
        if (nameMatch) {return nameMatch.language;}

        return null;
    }

    async detectLanguage(text) {
        const body = { q: text };
        if (this.apiKey) {body.api_key = this.apiKey;}

        const opts = this._withTimeout({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let response;
        try {
            response = await fetch(`${this.baseUrl}/detect`, opts);
        } finally {
            this._clearTimeout(opts);
        }

        if (!response.ok) {return null;}
        const result = await response.json();
        return result && result.length > 0 ? result[0].language.toUpperCase() : null;
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
            const detected = await this.detectLanguage(text);
            const sourceCode = detected || 'auto';

            const translateBody = {
                q: text,
                source: sourceCode.toLowerCase(),
                target: normalizedTarget.toLowerCase(),
                format: 'text'
            };
            if (this.apiKey) {translateBody.api_key = this.apiKey;}

            const translateOpts = this._withTimeout({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(translateBody)
            });
            let translateResponse;
            try {
                translateResponse = await fetch(`${this.baseUrl}/translate`, translateOpts);
            } finally {
                this._clearTimeout(translateOpts);
            }

            if (!translateResponse.ok) {
                const errorData = await translateResponse.json().catch(() => ({}));
                if (translateResponse.status === 429) {
                    throw new Error('Too many translation requests. Please wait a moment.');
                }
                if (translateResponse.status === 403) {
                    throw new Error('Translation API authentication failed. Check your API key.');
                }
                throw new Error(`Translation failed: ${errorData.error || translateResponse.statusText}`);
            }

            const result = await translateResponse.json();

            const sourceLangName = detected
                ? (this.getLanguageName(detected) || detected)
                : 'Auto-detected';
            const targetLangName = this.getLanguageName(normalizedTarget) || normalizedTarget;

            return {
                original: text,
                translated: result.translatedText,
                sourceLang: detected || 'auto',
                targetLang: normalizedTarget,
                sourceLangName,
                targetLangName
            };
        } catch (error) {
            if (error.message.includes('Too many') || error.message.includes('authentication failed')) {
                throw error;
            }
            throw new Error(`Translation failed: ${error.message}`, { cause: error });
        }
    }

    getLanguageName(code) {
        if (!code) {return null;}
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

export default TranslationService;
