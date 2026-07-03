import { describe, it, expect, beforeAll, vi } from 'vitest';

describe('Interlink Commands', () => {
    let cmd;

    beforeAll(async () => {
        cmd = (await import('../../../../src/plugins/interlink/commands/interlink.js')).default;
    });

    it('should have correct command metadata', () => {
        expect(cmd.name).toBe('interlink');
        expect(cmd.description).toBe('Manage cross-bot communication (bot owner only)');
        expect(cmd.options).toBeDefined();
    });

    it('should have subcommands list, register, remove, send, broadcast, rotate-key', () => {
        const subcommands = cmd.options.filter(o => o.type === 1);
        const names = subcommands.map(s => s.name).sort();
        expect(names).toEqual(['broadcast', 'list', 'override', 'register', 'remove', 'rotate-key', 'send']);
    });

    it('should have register subcommand with required name and webhook-url', () => {
        const register = cmd.options.find(o => o.name === 'register');
        expect(register).toBeDefined();
        const nameOpt = register.options.find(o => o.name === 'name');
        expect(nameOpt).toBeDefined();
        expect(nameOpt.required).toBe(true);
        const webhookOpt = register.options.find(o => o.name === 'webhook-url');
        expect(webhookOpt).toBeDefined();
        expect(webhookOpt.required).toBe(true);
    });

    it('should restrict to bot owners', async () => {
        process.env.OWNER_IDS = 'owner123';
        const interaction = {
            user: { id: 'notowner' },
            reply: vi.fn(),
            editReply: vi.fn(),
            deferReply: vi.fn(),
            options: { getSubcommand: () => 'list' }
        };
        await cmd.execute(interaction);
        expect(interaction.deferReply).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalled();
        expect(interaction.editReply.mock.calls[0][0].embeds[0].color).toBe(0xFF0000);
        delete process.env.OWNER_IDS;
    });
});
