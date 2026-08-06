import { describe, it, expect } from 'vitest';
import { assertDiscordToken } from '../../../src/utils/startupChecks.js';

describe('assertDiscordToken', () => {
    it('should throw when token is missing', () => {
        expect(() => assertDiscordToken('')).toThrow(/DISCORD_TOKEN/);
        expect(() => assertDiscordToken(undefined)).toThrow(/DISCORD_TOKEN/);
    });

    it('should throw when token is the placeholder', () => {
        expect(() => assertDiscordToken('your-token-here')).toThrow(/DISCORD_TOKEN/);
    });

    it('should not throw for a real-looking token', () => {
        expect(() => assertDiscordToken('abc123.def456.ghi789')).not.toThrow();
    });
});
