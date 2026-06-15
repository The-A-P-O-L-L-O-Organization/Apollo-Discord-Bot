# Translation Command Design Spec

**Date:** 2026-06-14  
**Feature:** `/translate` slash command for real-time message translation  
**Status:** Design approved

## Overview

Add a new `/translate` command that allows users to reply to any message and translate its content to their preferred language. The command will automatically detect the source language and support translation to 30+ languages via LibreTranslate (free, no credit card needed).

## User Stories

- As a user, I want to understand messages in other languages without switching tools
- As a server admin, I want members who speak different languages to communicate effectively
- As a user, I want simple translation without complexity or multiple steps

## Requirements

### Functional Requirements

1. **Command Invocation**
   - Slash command: `/translate [target_language]`
   - Must be used as a reply to an existing message
   - Target language is optional; defaults to English if not specified
   - Target language can be specified as language code (e.g., `en`, `es`, `fr`) or common name (e.g., `English`, `Spanish`, `French`)

2. **Translation Behavior**
   - Automatically detect the source language using LibreTranslate's detection
   - Translate message content to the specified target language
   - Support 30+ languages (LibreTranslate's available set)
   - Reject messages without text content (embeds, attachments-only) with helpful error

3. **Response Format**
   - Display as a quote of the original text followed by the translation
   - Show language names (not codes) for clarity
   - Format: `> [Original Text] ([Source Language])\n\nTranslation ([Target Language])`
   - Send response in the same channel as the original message
   - Response should be a reply to the user who invoked the command

4. **Language Support**
   - Cache list of supported languages on bot startup
   - Validate user input against supported languages
   - Accept both language codes and common English names
   - Provide helpful error message if unsupported language is requested

### Non-Functional Requirements

1. **Error Handling**
   - Invalid target language → inform user with list of available options
   - Message has no translatable content → clear explanation
   - LibreTranslate API unavailable → user-friendly error message
   - Rate limiting/quota exceeded → queue retry
   - Network timeouts → graceful failure with user notification

2. **Performance**
   - API calls should complete within 5 seconds
   - Defer replies immediately to show "thinking" indicator
   - Cache supported languages in memory (refresh on bot restart)

3. **Security & Compliance**
   - Store API configuration in environment variables (`TRANSLATION_API_BASE_URL`, `TRANSLATION_API_KEY`)
   - No sensitive data logging (don't log translated content)
   - Respect Discord rate limiting

## Architecture

### File Structure

```
src/
├── plugins/utility/commands/
│   └── translate.js          # Command handler
└── utils/
    └── translation.js        # LibreTranslate API wrapper
```

### Components

#### 1. Command Handler (`src/plugins/utility/commands/translate.js`)

**Responsibilities:**
- Parse slash command input (target language argument)
- Validate that command was used as a reply
- Extract message content from replied-to message
- Call translation service
- Format and send response

**Interface:**
```javascript
{
  name: 'translate',
  description: 'Translate a message to another language',
  category: 'Utility',
  options: [
    {
      name: 'language',
      description: 'Target language (e.g., English, Spanish)',
      type: 'STRING',
      required: false,
      autocomplete: true
    }
  ],
  async execute(interaction) { ... }
}
```

#### 2. Translation Service (`src/utils/translation.js`)

**Responsibilities:**
- Initialize LibreTranslate client with optional API key
- Translate text with source/target language detection
- Manage supported languages list
- Handle API errors and retries

**Public Methods:**
```javascript
- initialize() → Promise<void> // Load supported languages on startup
- translate(text, targetLanguage) → Promise<{original, translated, sourceLang, targetLang}>
- getSupportedLanguages() → Array<{code, name, ...}>
- validateLanguage(language) → boolean
```

### Data Flow

```
User replies with /translate en
           ↓
Command receives interaction
           ↓
Validate replied message exists & has text
           ↓
Defer reply (show "thinking" indicator)
           ↓
Call TranslationService.translate(messageContent, 'English')
            ↓
LibreTranslate detects source language, translates content
           ↓
Format response: "> Original (Language)\n\nTranslation (Language)"
           ↓
Edit deferred reply with response
```

### Configuration

**Environment Variables:**
- `TRANSLATION_API_BASE_URL` (optional) — LibreTranslate instance base URL (defaults to public instance)
- `TRANSLATION_API_KEY` (optional) — API key if required by your instance

**Constants:**
- `DEFAULT_TARGET_LANGUAGE = 'EN'` — English if not specified
- `TRANSLATION_TIMEOUT = 5000` — milliseconds before timeout
- `MAX_RETRY_ATTEMPTS = 3` — retry attempts for failed requests

## Error Scenarios

| Scenario | User Message |
|----------|--------------|
| No message replied to | "Please reply to a message to translate it." |
| Message has no text | "That message doesn't have any text to translate." |
| Invalid language | "Language not recognized. Available: English, Spanish, French, ..." |
| LibreTranslate API error | "Translation failed. Please try again in a moment." |
| Timeout | "Translation took too long. Please try again." |
| Rate limited | "Too many translations at once. Please wait a moment." |

## Testing Strategy

1. **Unit Tests**
   - Translation service language validation
   - Language code/name conversion
   - Error handling for various API responses

   - Mock LibreTranslate API for reliable testing

2. **Integration Tests**
   - Command execution with valid replied message
   - Command execution without reply (should fail)
   - Empty/whitespace-only messages
   - Various languages (English, Spanish, Chinese, emoji-heavy text, etc.)

3. **Manual Testing**
   - Reply to message with `/translate` (English default)
   - Reply with `/translate Spanish`
   - Reply with `/translate es` (code format)
   - Invalid language name
   - Message with no text content

## Success Criteria

- Command executes successfully on message reply
- Source language is correctly detected
- Translation is accurate and readable
- Response displays both original and translation with language names
- All error cases handled gracefully
- No sensitive data logged
- Command is discoverable via slash command autocomplete

## Future Enhancements

- Context-aware translations (technical vs. casual)
- Batch translate multiple messages
- Translation history/cache
- User language preferences (default target language)
- Stats on which languages are most translated
