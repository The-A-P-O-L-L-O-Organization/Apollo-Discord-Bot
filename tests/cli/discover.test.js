import { describe, it, expect } from 'vitest';
import { discoverCommands, resolveCommand } from '../../src/cli/discover.js';

describe('discoverCommands', () => {
    it('returns an object with plugin names as keys', async() => {
        const map = await discoverCommands();
        expect(map).toBeTypeOf('object');
    });
});

describe('resolveCommand', () => {
    const mockCommandMap = {
        automod: {
            name: 'automod',
            commands: [
                {
                    name: 'listwords',
                    description: 'List banned words',
                    options: [],
                    execute: async() => ({ words: [] })
                },
                {
                    name: 'set',
                    description: 'Set config',
                    options: [{ name: 'setting', description: 'Setting name', required: true }],
                    subcommands: [
                        {
                            name: 'list',
                            description: 'List settings',
                            execute: async() => ({ settings: [] })
                        }
                    ]
                }
            ]
        }
    };

    it('resolves a two-segment path (plugin + command)', () => {
        const result = resolveCommand(mockCommandMap, ['automod', 'listwords']);
        expect(result).not.toBeNull();
        expect(result.command.name).toBe('listwords');
    });

    it('resolves a three-segment path (plugin + command + subcommand)', () => {
        const result = resolveCommand(mockCommandMap, ['automod', 'set', 'list']);
        expect(result).not.toBeNull();
        expect(result.command.name).toBe('list');
    });

    it('returns null for unknown plugin', () => {
        const result = resolveCommand(mockCommandMap, ['unknown', 'foo']);
        expect(result).toBeNull();
    });

    it('returns null for unknown command', () => {
        const result = resolveCommand(mockCommandMap, ['automod', 'nonexistent']);
        expect(result).toBeNull();
    });

    it('returns null for empty path', () => {
        const result = resolveCommand(mockCommandMap, []);
        expect(result).toBeNull();
    });
});
