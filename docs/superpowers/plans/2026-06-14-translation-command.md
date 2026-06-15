# Translation Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Translate" message context menu command that shows a modal for language selection and translates the target message via LibreTranslate (free, no credit card needed).

**Architecture:** Three-component system — a message context menu command (type 3) that triggers a language selection modal, a translation service utility for API communication, and an interaction handler update in `src/index.js` to support context menu commands. The TranslationService initializes in the utility plugin (following existing patterns for reminders, polls, analytics).

**Tech Stack:** Discord.js v14 (MessageContextMenuCommandInteraction, Modals), LibreTranslate API (REST, no npm package needed), Node.js env vars

---

## File Structure

```
src/
├── index.js                             # Modify: add context menu handling
├── plugins/utility/
│   ├── plugin.js                        # Modify: init TranslationService in onEnable()
│   └── commands/
│       └── translate.js                 # Create: context menu + modal + translation
└── utils/
    └── translation.js                   # Create: LibreTranslate API wrapper and language cache

tests/
└── unit/
    └── utils/
        └── translation.test.js          # Create: unit tests for TranslationService
```

---

## Task 1: Set Up LibreTranslate Configuration

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add env vars to .env.example**

```
TRANSLATION_API_BASE_URL=https://translate.argosopentech.com
TRANSLATION_API_KEY=your_api_key_here
```

> Note: No npm package needed — LibreTranslate uses REST API via native `fetch`.

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add LibreTranslate env vars for translation feature"
```

---

## Task 2: Create TranslationService with Tests

**Files:**
- Create: `src/utils/translation.js`
- Create: `tests/unit/utils/translation.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/utils/translation.test.js`:

```javascript
import { describe, it, expect, beforeAll, vi } from 'vitest';
import TranslationService from '../../../src/utils/translation.js';

describe('TranslationService', () => {
    let service;

    beforeAll(async () => {
        process.env.TRANSLATION_API_KEY = 'test-key-1234567890';
        process.env.TRANSLATION_API_BASE_URL = 'https://test.instance.com';
        service = new TranslationService();
    });

    describe('constructor', () => {
        it('should not throw if TRANSLATION_API_KEY is not set', () => {
            const originalKey = process.env.TRANSLATION_API_KEY;
            delete process.env.TRANSLATION_API_KEY;
            expect(() => new TranslationService()).not.toThrow();
            process.env.TRANSLATION_API_KEY = originalKey;
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
        it('should throw for empty text', async () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            await expect(service.translate('', 'EN')).rejects.toThrow('empty');
            await expect(service.translate('   ', 'EN')).rejects.toThrow('empty');
        });

        it('should throw for unsupported target language', async () => {
            service.setCachedLanguages([{ language: 'EN', name: 'English' }]);
            await expect(service.translate('Hello', 'XX')).rejects.toThrow('Unsupported language');
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpx vitest run tests/unit/utils/translation.test.js
```
Expected: FAIL - module not found

- [ ] **Step 3: Write TranslationService implementation**

Create `src/utils/translation.js`:

```javascript
// TranslationService using LibreTranslate REST API

class TranslationService {
    constructor() {
        this.apiBaseUrl = process.env.TRANSLATION_API_BASE_URL || 'https://translate.argosopentech.com';
        this.apiKey = process.env.TRANSLATION_API_KEY || null;
        this.cachedLanguages = [];
    }

    async initialize() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/languages`);
            const languages = await response.json();
            this.cachedLanguages = languages.map(lang => ({
                language: lang.code.toUpperCase(),
                name: lang.name
            }));
            console.log(`[Translation] Initialized with ${this.cachedLanguages.length} supported languages`);
        } catch (error) {
            console.error('[Translation] Failed to initialize:', error.message);
            throw error;
        }
    }

    getSupportedLanguages() {
        return this.cachedLanguages;
    }

    getCachedLanguages() {
        return this.cachedLanguages;
    }

    setCachedLanguages(languages) {
        this.cachedLanguages = languages;
    }

    validateLanguage(language) {
        if (!language) return false;
        const upperLang = language.toUpperCase();
        return this.cachedLanguages.some(lang =>
            lang.language === upperLang ||
            lang.name.toUpperCase() === upperLang
        );
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
            const response = await fetch(`${this.apiBaseUrl}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
                },
                body: JSON.stringify({
                    q: text,
                    source: 'auto',
                    target: normalizedTarget.toLowerCase()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            const sourceLangName = this.getLanguageName(data.detectedLanguage) || data.detectedLanguage;
            const targetLangName = this.getLanguageName(normalizedTarget) || normalizedTarget;

            return {
                original: text,
                translated: data.translatedText,
                sourceLang: data.detectedLanguage,
                targetLang: normalizedTarget,
                sourceLangName,
                targetLangName
            };
        } catch (error) {
            if (error.message.includes('429')) {
                throw new Error('Too many translation requests. Please wait a moment.');
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

export default TranslationService;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpx vitest run tests/unit/utils/translation.test.js
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/translation.js tests/unit/utils/translation.test.js
git commit -m "feat: add TranslationService with language management and LibreTranslate support"
```

---

## Task 3: Initialize TranslationService in Utility Plugin

**Files:**
- Modify: `src/plugins/utility/plugin.js`

TranslationService initialization follows the existing pattern — reminders, polls, and analytics collectors are all initialized in the utility plugin's `onEnable()`.

- [ ] **Step 1: Add TranslationService import and initialization**

In `src/plugins/utility/plugin.js`, add the import at the top (after existing imports):
```javascript
import TranslationService from '../../utils/translation.js';
```

In the `onEnable()` method, add initialization after the existing initializers:
```javascript
// Initialize TranslationService for LibreTranslate
try {
    const translationService = new TranslationService();
    await translationService.initialize();
    global.translationService = translationService;
    console.log('[Utility] TranslationService initialized');
} catch (error) {
    console.warn('[Utility] TranslationService not available:', error.message);
}
```

- [ ] **Step 2: Verify the onEnable method is correct**

The final `onEnable()` should look like:
```javascript
async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    this._registerSocketHandlers();
    await initReminderScheduler(this.client);
    await initPollScheduler(this.client);
    initAnalyticsCollector(this.client);

    try {
        const translationService = new TranslationService();
        await translationService.initialize();
        global.translationService = translationService;
        console.log('[Utility] TranslationService initialized');
    } catch (error) {
        console.warn('[Utility] TranslationService not available:', error.message);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/plugins/utility/plugin.js
git commit -m "feat: initialize TranslationService in utility plugin"
```

---

## Task 4: Update Interaction Handler for Context Menu Commands

**Files:**
- Modify: `src/index.js`

The current handler at line 70-71 only processes `isChatInputCommand()`. Context menu commands (type 3) are silently ignored. We need to:
1. Accept message context menu interactions
2. Execute them directly (no queue — context menus don't need queuing)
3. Allow modal submit interactions to pass through for `awaitModalSubmit`

- [ ] **Step 1: Update the interaction guard and add context menu handling**

Replace lines 70-139 with the updated handler:

```javascript
client.on('interactionCreate', async(interaction) => {
    // Handle message context menu commands (e.g., Translate)
    if (interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.log('[ERROR] Context menu command not found:', interaction.commandName);
            return;
        }
        try {
            await command.execute(interaction);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
        } catch (error) {
            console.error('[ERROR] Error executing context menu command:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred.' });
                } else {
                    await interaction.reply({ content: 'An error occurred.', ephemeral: true });
                }
            } catch (e) {
                console.error('[ERROR] Failed to send error response:', e);
            }
        }
        return;
    }

    // Let modal submits pass through for awaitModalSubmit collectors
    if (interaction.isModalSubmit()) {
        return;
    }

    if (!interaction.isChatInputCommand()) {return;}

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.log('[ERROR] Command not found: /' + interaction.commandName);
        return;
    }

    const shouldQueue = config.queue.enabled && command.canQueue !== false;

    if (shouldQueue) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }
            const { enqueueCommand } = await import('./queue/jobs/processCommand.js');
            await enqueueCommand(interaction);
            client.stats.commandsRan++;
            if (interaction.guild) {
                trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
            }
        } catch (error) {
            console.error('[ERROR] Error queueing /' + interaction.commandName + ':', error);
            const errorEmbed = {
                color: 0xFF0000,
                title: 'Error',
                description: 'Failed to queue command. Is the queue available?',
                timestamp: new Date().toISOString()
            };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }
            } catch (e) {
                console.error('[ERROR] Failed to send error response:', e);
            }
        }
        return;
    }

    try {
        await command.execute(interaction);
        client.stats.commandsRan++;
        if (interaction.guild) {
            trackCommand(interaction.guild.id, interaction.commandName, interaction.user.id);
        }
    } catch (error) {
        console.error('[ERROR] Error executing /' + interaction.commandName + ':', error);

        const errorEmbed = {
            color: 0xFF0000,
            title: 'Error',
            description: 'An error occurred while executing this command.',
            fields: [{ name: 'Error', value: error.message || 'Unknown error' }],
            timestamp: new Date().toISOString()
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            console.error('[ERROR] Failed to send error response:', e);
        }
    }
});
```

- [ ] **Step 2: Verify the import order is correct**

The `MessageFlags` import is already on line 3. No new imports needed.

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: handle message context menu and modal submit interactions"
```

---

## Task 5: Create Translate Command (Context Menu + Modal)

**Files:**
- Create: `src/plugins/utility/commands/translate.js`

- [ ] **Step 1: Write the command**

Create `src/plugins/utility/commands/translate.js`:

```javascript
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export default {
    name: 'Translate',
    type: 3,
    category: 'Utility',

    async execute(interaction) {
        const translationService = global.translationService;
        if (!translationService) {
            await interaction.reply({
                content: 'Translation service is not available.',
                ephemeral: true
            });
            return;
        }

        const messageToTranslate = interaction.targetMessage;
        const textToTranslate = messageToTranslate.content;

        if (!textToTranslate || textToTranslate.trim().length === 0) {
            await interaction.reply({
                content: "That message doesn't have any text to translate.",
                ephemeral: true
            });
            return;
        }

        // Show modal for target language input
        const modal = new ModalBuilder()
            .setCustomId(`translate_lang_${interaction.id}`)
            .setTitle('Translate Message');

        const languageInput = new TextInputBuilder()
            .setCustomId('target_language')
            .setLabel('Target language (leave blank for English)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Spanish, French, de, ja')
            .setMaxLength(50)
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(languageInput));

        await interaction.showModal(modal);

        try {
            const modalSubmit = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: i => i.customId === `translate_lang_${interaction.id}`
            });

            const targetLanguage = modalSubmit.fields.getTextInputValue('target_language').trim() || 'EN';

            // Defer the modal reply to show loading
            await modalSubmit.deferReply({ ephemeral: true });

            const translation = await translationService.translate(textToTranslate, targetLanguage);

            const response = `> **${translation.sourceLangName}:**\n> ${translation.original}\n\n**${translation.targetLangName}:**\n${translation.translated}`;

            await modalSubmit.editReply({ content: response });
            console.log(`[TRANSLATE] ${interaction.user.tag} translated from ${translation.sourceLangName} to ${translation.targetLangName}`);
        } catch (error) {
            if (error.message?.includes('time') || error.code === 'InteractionCollectorError') {
                return; // User just didn't respond to modal, that's fine
            }
            console.error('[TRANSLATE] Error:', error.message);

            let errorMessage = 'Translation failed. Please try again.';
            if (error.message.includes('Unsupported language')) {
                const langs = global.translationService?.getAvailableLanguagesString();
                errorMessage = `Language not supported. Available: ${langs || 'see LibreTranslate docs'}`;
            } else if (error.message.includes('Too many')) {
                errorMessage = 'Too many translation requests. Please wait a moment.';
            }

            await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
    }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/utility/commands/translate.js
git commit -m "feat: add Translate context menu command with language modal"
```

---

## Task 6: Test the Full Flow

**Files:**
- No changes

- [ ] **Step 1: Set up LibreTranslate env vars**

Add to `.env`:
```
TRANSLATION_API_BASE_URL=https://translate.argosopentech.com
TRANSLATION_API_KEY=
```

> Note: Most public LibreTranslate instances don't require an API key. For the default public instance, no key is needed.

- [ ] **Step 2: Register commands with Discord**

```bash
pnpm run deploy
```
Expected: Shows "Translate" in the deployed commands list

- [ ] **Step 3: Start the bot**

```bash
pnpm start
```
Expected logs:
```
[Translation] Initialized with 30+ supported languages
[Utility] TranslationService initialized
```

- [ ] **Step 4: Test in Discord**

Test flow:
1. Find any message with text content
2. Right-click → Apps → Translate
3. Modal appears with language input
4. Leave blank (defaults to English) → submit
5. ✅ Response shows original quoted text + translation

Additional tests:
- Reply with "Spanish" in the modal → translation to Spanish
- Reply with "de" (language code) → translation to German
- Translate a message that is already in English → should show same text
- Translate an empty/embed-only message → should show error before modal
- Try translating a very long message → should handle correctly
- Dismiss modal without submitting → no error, graceful timeout

- [ ] **Step 5: No commit needed**

Testing verified; move to finalization.

---

## Task 7: Final Verification

**Files:**
- No changes

- [ ] **Step 1: Run unit tests**

```bash
pnpx vitest run tests/unit/utils/translation.test.js
```
Expected: All PASS

- [ ] **Step 2: Check bot console for errors**

Verify no error logs related to:
- TranslationService initialization failures
- Missing API configuration
- Command registration issues

- [ ] **Step 3: Verify command appears in Discord**

Type `/` → look for "Translate" in the context menu (right-click a message → Apps)

- [ ] **Step 4: Final commit for any fixes**

```bash
git status
```
If clean, done. If fixes were made:
```bash
git add .
git commit -m "chore: final cleanup for translate command"
```
