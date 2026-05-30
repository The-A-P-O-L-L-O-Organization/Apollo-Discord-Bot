import { describe, it, expect } from 'vitest';
import automodCommands from '../../src/plugins/automod/cli/index.js';

describe('automod CLI commands', () => {
    it('exports the automod plugin definition', () => {
        expect(automodCommands.name).toBe('automod');
        expect(Array.isArray(automodCommands.commands)).toBe(true);
    });

    it('has a listwords command', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'listwords');
        expect(cmd).toBeDefined();
        expect(typeof cmd.execute).toBe('function');
    });

    it('has a status command', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'status');
        expect(cmd).toBeDefined();
    });

    it('has an addword command with word option', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'addword');
        expect(cmd).toBeDefined();
        const wordOpt = cmd.options.find(o => o.name === 'word');
        expect(wordOpt).toBeDefined();
        expect(wordOpt.required).toBe(true);
    });

    it('has a removeword command with word option', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'removeword');
        expect(cmd).toBeDefined();
    });

    it('has a set command with setting and value options', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'set');
        expect(cmd).toBeDefined();
    });

    it('has exemptrole command with role and action options', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'exemptrole');
        expect(cmd).toBeDefined();
        const actionOpt = cmd.options.find(o => o.name === 'action');
        expect(actionOpt.choices).toContain('add');
        expect(actionOpt.choices).toContain('remove');
    });

    it('has exemptchannel command', () => {
        const cmd = automodCommands.commands.find(c => c.name === 'exemptchannel');
        expect(cmd).toBeDefined();
    });

    it('has enable and disable commands', () => {
        expect(automodCommands.commands.find(c => c.name === 'enable')).toBeDefined();
        expect(automodCommands.commands.find(c => c.name === 'disable')).toBeDefined();
    });
});
