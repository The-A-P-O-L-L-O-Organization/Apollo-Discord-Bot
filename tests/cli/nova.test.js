import { describe, it, expect, vi, beforeEach } from 'vitest';
import novaCommands from '../../src/plugins/nova/cli/index.js';

describe('nova CLI commands', () => {
    it('exports the nova plugin definition', () => {
        expect(novaCommands.name).toBe('nova');
        expect(Array.isArray(novaCommands.commands)).toBe(true);
    });

    it('has a word command with execute function', () => {
        const word = novaCommands.commands.find(c => c.name === 'word');
        expect(word).toBeDefined();
        expect(typeof word.execute).toBe('function');
    });

    it('has a today command with execute function', () => {
        const today = novaCommands.commands.find(c => c.name === 'today');
        expect(today).toBeDefined();
        expect(typeof today.execute).toBe('function');
    });
});
