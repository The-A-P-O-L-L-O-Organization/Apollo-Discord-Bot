import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/cli/parse.js';

describe('parseArgs', () => {
    it('parses plugin and command from positional args', () => {
        const result = parseArgs(['automod', 'listwords']);
        expect(result.path).toEqual(['automod', 'listwords']);
    });

    it('parses subcommand path with three segments', () => {
        const result = parseArgs(['admin', 'plugin', 'list']);
        expect(result.path).toEqual(['admin', 'plugin', 'list']);
    });

    it('parses flags after the path', () => {
        const result = parseArgs(['automod', 'listwords', '--guild', '123']);
        expect(result.path).toEqual(['automod', 'listwords']);
        expect(result.flags).toEqual({ guild: '123' });
    });

    it('parses multiple flags', () => {
        const result = parseArgs(['moderation', 'ban', '--user', '456', '--reason', 'spam']);
        expect(result.flags).toEqual({ user: '456', reason: 'spam' });
    });

    it('handles boolean flags (no value)', () => {
        const result = parseArgs(['moderation', 'ban', '--confirm']);
        expect(result.flags).toEqual({ confirm: true });
    });

    it('detects --help flag', () => {
        const result = parseArgs(['--help']);
        expect(result.flags).toEqual({ help: true });
    });

    it('handles --help anywhere in args', () => {
        const result = parseArgs(['automod', '--help']);
        expect(result.flags).toEqual({ help: true });
        expect(result.path).toEqual(['automod']);
    });

    it('handles empty args', () => {
        const result = parseArgs([]);
        expect(result.path).toEqual([]);
        expect(result.flags).toEqual({});
    });

    it('handles flag with = syntax', () => {
        const result = parseArgs(['automod', 'addword', '--word=badword', '--guild=123']);
        expect(result.flags).toEqual({ word: 'badword', guild: '123' });
    });

    it('treats everything after -- as positional', () => {
        const result = parseArgs(['automod', '--', '--guild', '123']);
        expect(result.path).toEqual(['automod', '--guild', '123']);
        expect(result.flags).toEqual({});
    });

    it('handles -- with no following args', () => {
        const result = parseArgs(['automod', 'listwords', '--']);
        expect(result.path).toEqual(['automod', 'listwords']);
    });
});
