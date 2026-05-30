import { describe, it, expect } from 'vitest';
import { run } from '../../src/cli/index.js';

describe('cli run', () => {
    const mockCommandMap = {
        test: {
            name: 'test',
            commands: [
                {
                    name: 'hello',
                    description: 'Say hello',
                    options: [{ name: 'name', description: 'Your name', required: true }],
                    execute: async(args) => `Hello, ${args.name}!`
                },
                {
                    name: 'ping',
                    description: 'Ping',
                    options: [],
                    execute: async() => 'pong'
                }
            ]
        }
    };

    it('executes a command successfully and returns formatted output', async() => {
        const output = await run(['test', 'hello', '--name', 'World'], mockCommandMap);
        expect(output).toContain('[SUCCESS]');
        expect(output).toContain('Hello, World!');
    });

    it('returns error for missing required option', async() => {
        const output = await run(['test', 'hello'], mockCommandMap);
        expect(output).toContain('[ERROR]');
        expect(output).toContain('Missing required option');
    });

    it('returns error for unknown command', async() => {
        const output = await run(['test', 'nonexistent'], mockCommandMap);
        expect(output).toContain('[ERROR]');
        expect(output).toContain('Unknown command');
    });

    it('returns error for unknown plugin', async() => {
        const output = await run(['unknown', 'foo'], mockCommandMap);
        expect(output).toContain('[ERROR]');
        expect(output).toContain('Unknown command');
    });

    it('returns help text when --help flag is set', async() => {
        const output = await run(['--help'], mockCommandMap);
        expect(output).toContain('Available commands');
    });

    it('handles empty argv', async() => {
        const output = await run([], mockCommandMap);
        expect(output).toContain('Available commands');
    });
});
