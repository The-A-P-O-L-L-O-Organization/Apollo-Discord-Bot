import { describe, it, expect } from 'vitest';
import adminCommands from '../../src/plugins/admin/cli/index.js';

describe('admin CLI commands', () => {
    it('exports the admin plugin definition', () => {
        expect(adminCommands.name).toBe('admin');
        expect(Array.isArray(adminCommands.commands)).toBe(true);
    });

    it('has a system command with an info subcommand', () => {
        const system = adminCommands.commands.find(c => c.name === 'system');
        expect(system).toBeDefined();
        const info = system.subcommands.find(s => s.name === 'info');
        expect(info).toBeDefined();
        expect(typeof info.execute).toBe('function');
    });

    it('the system info executor returns an object with uptime, memory, nodeVersion', async() => {
        const system = adminCommands.commands.find(c => c.name === 'system');
        const info = system.subcommands.find(s => s.name === 'info');
        const result = await info.execute({});
        expect(result).toHaveProperty('uptime');
        expect(result).toHaveProperty('memory');
        expect(result).toHaveProperty('nodeVersion');
        expect(typeof result.uptime).toBe('number');
        expect(typeof result.memory).toBe('number');
        expect(result.nodeVersion).toBe(process.version);
    });
});
