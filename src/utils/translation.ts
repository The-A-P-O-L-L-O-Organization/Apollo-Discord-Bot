// Translation Service Utility
// Interfaces with Argos Open Tech translation API

const FETCH_TIMEOUT_MS = 30000;

interface LanguageEntry {
    language: string;
    name: string;
}

interface TranslationOptions {
    baseUrl?: string;
    apiKey?: string;
}

interface TranslationResult {
    original: string;
    translated: string;
    sourceLang: string;
    targetLang: string;
    sourceLangName: string;
    targetLangName: string;
}

export class TranslationService {
    private baseUrl: string;
    private apiKey: string;
    private cachedLanguages: LanguageEntry[] = [];

    constructor(options: TranslationOptions = {}) {
        this.baseUrl = options.baseUrl ?? process.env['TRANSLATION_API_BASE_URL'] ?? 'https://translate.argosopentech.com';
        if (!this.baseUrl.startsWith('https://')) {
            throw new Error('TRANSLATION_API_BASE_URL must use HTTPS.');
        }
        this.apiKey = options.apiKey ?? process.env['TRANSLATION_API_KEY'] ?? '';
        this.cachedLanguages = [];
    }

    private _withTimeout(opts: RequestInit = {}): RequestInit & { _timeoutTimer: NodeJS.Timeout } {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        return { ...opts, signal: controller.signal, _timeoutTimer: timer };
    }

    private _clearTimeout(opts: RequestInit & { _timeoutTimer?: NodeJS.Timeout }): void {
        if (opts._timeoutTimer) { clearTimeout(opts._timeoutTimer); }
    }

    async initialize(): Promise<void> {
        try {
            const opts = this._withTimeout();
            let response: Response;
            try {
                response = await fetch(`${this.baseUrl}/languages`, opts);
            } finally {
                this._clearTimeout(opts);
            }
            if (!response.ok) {
                throw new Error(`Failed to fetch languages: ${response.status}`);
            }
            const languages = await response.json() as Array<{ code: string; name: string }>;
            this.cachedLanguages = languages.map(lang => ({
                language: lang.code.toUpperCase(),
                name: lang.name
            }));
            console.info(`[Translation] Initialized with ${this.cachedLanguages.length} supported languages`);
        } catch (error) {
            const err = error as Error;
            console.warn('[Translation] Initialization failed (service may be unavailable):', err.message);
            throw error;
        }
    }

    getSupportedLanguages(): LanguageEntry[] {
        return this.cachedLanguages;
    }

    setCachedLanguages(languages: LanguageEntry[]): void {
        this.cachedLanguages = languages;
    }

    validateLanguage(language: string): boolean {
        return this.normalizeLanguageCode(language) !== null;
    }

    normalizeLanguageCode(language: string | undefined | null): string | null {
        if (!language) { return null; }
        const upperLang = language.toUpperCase();

        const codeMatch = this.cachedLanguages.find(lang => lang.language === upperLang);
        if (codeMatch) { return codeMatch.language; }

        const nameMatch = this.cachedLanguages.find(lang =>
            lang.name.toUpperCase() === upperLang
        );
        if (nameMatch) { return nameMatch.language; }

        return null;
    }

    async detectLanguage(text: string): Promise<string | null> {
        const body: Record<string, string> = { q: text };
        if (this.apiKey) { body['api_key'] = this.apiKey; }

        const opts = this._withTimeout({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/detect`, opts);
        } finally {
            this._clearTimeout(opts);
        }

        if (!response.ok) { return null; }
        const result = await response.json() as Array<{ language: string }>;
        return result && result.length > 0 && result[0] ? result[0].language.toUpperCase() : null;
    }

    async translate(text: string, targetLanguage: string): Promise<TranslationResult> {
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
            const sourceCode = detected ?? 'auto';

            const translateBody: Record<string, string> = {
                q: text,
                source: sourceCode.toLowerCase(),
                target: normalizedTarget.toLowerCase(),
                format: 'text'
            };
            if (this.apiKey) { translateBody['api_key'] = this.apiKey; }

            const translateOpts = this._withTimeout({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(translateBody)
            });
            let translateResponse: Response;
            try {
                translateResponse = await fetch(`${this.baseUrl}/translate`, translateOpts);
            } finally {
                this._clearTimeout(translateOpts);
            }

            if (!translateResponse.ok) {
                const errorData = await translateResponse.json().catch(() => ({})) as Record<string, unknown>;
                if (translateResponse.status === 429) {
                    throw new Error('Too many translation requests. Please wait a moment.');
                }
                if (translateResponse.status === 403) {
                    throw new Error('Translation API authentication failed. Check your API key.');
                }
                throw new Error(`Translation failed: ${errorData['error'] ?? translateResponse.statusText}`);
            }

            const result = await translateResponse.json() as { translatedText: string };

            const sourceLangName = detected
                ? (this.getLanguageName(detected) ?? detected)
                : 'Auto-detected';
            const targetLangName = this.getLanguageName(normalizedTarget) ?? normalizedTarget;

            return {
                original: text,
                translated: result.translatedText,
                sourceLang: detected ?? 'auto',
                targetLang: normalizedTarget,
                sourceLangName,
                targetLangName
            };
        } catch (error) {
            const err = error as Error;
            if (err.message.includes('Too many') || err.message.includes('authentication failed')) {
                throw error;
            }
            const newError = new Error(`Translation failed: ${err.message}`);
            (newError as Error & { cause?: Error }).cause = err;
            throw newError;
        }
    }

    getLanguageName(code: string): string | null {
        if (!code) { return null; }
        const upperCode = code.toUpperCase();
        const lang = this.cachedLanguages.find(l => l.language === upperCode);
        return lang ? lang.name : null;
    }

    getAvailableLanguagesString(): string {
        return this.cachedLanguages
            .map(lang => `${lang.name} (${lang.language})`)
            .join(', ');
    }
}

export default TranslationService;