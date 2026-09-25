import { describe, it, expect } from 'vitest';
import { buildCommandPayload, checkCommandLocales } from '../src/i18n/commandPayload.js';

describe('buildCommandPayload', () => {
    it('maps legacy localizations to the Discord trio with base intact', () => {
        const payload = buildCommandPayload({
            name: 'ping',
            description: 'Check the bot\'s latency and response time',
            nameLocalizations: { 'es-ES': 'ping', de: 'ping' },
            descriptionLocalizations: { 'es-ES': 'Responde con pong', de: 'Antwortet mit Pong' }
        });
        expect(payload['name']).toBe('ping');
        expect(payload['description']).toBe('Check the bot\'s latency and response time');
        expect(payload['name_localizations']).toEqual({ 'es-ES': 'ping', de: 'ping' });
        expect(payload['description_localizations']).toEqual({ 'es-ES': 'Responde con pong', de: 'Antwortet mit Pong' });
    });

    it('passes builder payloads through untouched', () => {
        const localized = {
            name: 'help',
            description: 'Shows all available commands',
            name_localizations: { 'es-ES': 'help', de: 'help' },
            description_localizations: { 'es-ES': 'Muestra ayuda', de: 'Zeigt Hilfe' }
        };
        const payload = buildCommandPayload({ data: { toJSON: () => ({ ...localized }) } });
        expect(payload).toEqual(localized);
    });

    it('falls back to base English without localization keys', () => {
        const payload = buildCommandPayload({ name: 'ping', description: 'Check latency' });
        expect(payload['name']).toBe('ping');
        expect(payload['description']).toBe('Check latency');
        expect(payload).not.toHaveProperty('name_localizations');
        expect(payload).not.toHaveProperty('description_localizations');
    });

    it('warns on missing and overlong localizations', () => {
        const warnings = checkCommandLocales([
            { name: 'ping', description: 'Check latency' },
            { name: 'big', description: 'Big', description_localizations: { 'es-ES': 'x'.repeat(8001) } }
        ]);
        expect(warnings.some((w) => w.includes('/ping'))).toBe(true);
        expect(warnings.some((w) => w.includes('/big'))).toBe(true);
    });
});
