import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../../../src/plugins/interlink/connectClient.js', () => ({
    getInterlinkClient: vi.fn(),
    generateNonce: () => 'test-nonce'
}));

describe('Interlink Commands', () => {
    let cmd: any;
    let mockClient: any;

    beforeAll(async () => {
        process.env['OWNER_IDS'] = 'owner123';
        const { getInterlinkClient } = await import('../../../../src/plugins/interlink/connectClient.js');
        mockClient = {
            listBots: vi.fn(),
            registerBot: vi.fn(),
            unregisterBot: vi.fn(),
            getBotInfo: vi.fn(),
            send: vi.fn()
        };
        vi.mocked(getInterlinkClient).mockReturnValue(mockClient);
        cmd = (await import('../../../../src/plugins/interlink/commands/interlink.js')).default;
    });

    it('should have correct command metadata', () => {
        expect(cmd.name).toBe('interlink');
        expect(cmd.description).toBe('Manage cross-bot communication (bot owner only)');
        expect(cmd.options).toBeDefined();
    });

    it('should have subcommands list, register, remove, send, broadcast, rotate-key', () => {
        const subcommands = (cmd.options.filter((o: { type: number }) => o.type === 1));
        const names = subcommands.map((s: any) => s.name)!.sort();
        expect(names).toEqual(['broadcast', 'list', 'override', 'register', 'remove', 'rotate-key', 'send']);
    });

    it('should have register subcommand with required name and webhook-url', () => {
        const register = cmd.options.find((o: any) => o.name === 'register');
        expect(register).toBeDefined();
        const nameOpt = register.options.find((o: any) => o.name === 'name');
        expect(nameOpt).toBeDefined();
        expect(nameOpt!.required).toBe(true);
        const webhookOpt = register.options.find((o: any) => o.name === 'webhook-url');
        expect(webhookOpt).toBeDefined();
        expect(webhookOpt!.required).toBe(true);
    });

    it('should restrict to bot owners', async () => {
        process.env['OWNER_IDS'] = 'owner123';
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
        expect(interaction.editReply.mock.calls[0]![0]!.embeds[0].color).toBe(0xFF0000);
        delete process.env['OWNER_IDS'];
    });

    function ownerInteraction(sub: string, getters: Record<string, unknown> = {}) {
        process.env['OWNER_IDS'] = 'owner123';
        return {
            user: { id: 'owner123' },
            deferReply: vi.fn(),
            editReply: vi.fn(),
            followUp: vi.fn(),
            replied: false,
            deferred: true,
            options: {
                getSubcommand: () => sub,
                getString: (name: string) => getters[name] ?? null,
                getBoolean: () => null
            }
        };
    }

    it('should list bots via the Connect client', async () => {
        mockClient.listBots.mockResolvedValue({
            bots: [{ botId: 'peer-a', endpoint: 'http://peer:50052', online: true, lastHeartbeat: BigInt(0) }]
        });
        const interaction = ownerInteraction('list');
        await cmd.execute(interaction);
        expect(mockClient.listBots).toHaveBeenCalled();
        const reply = interaction.editReply.mock.calls[0]![0]!;
        expect(reply.embeds[0].title).toContain('Registered Bots (1)');
        expect(reply.embeds[0].description).toContain('peer-a');
    });

    it('should send via the Connect client', async () => {
        mockClient.getBotInfo.mockResolvedValue({ botId: 'peer-a', online: true });
        mockClient.send.mockResolvedValue({ accepted: true, messageId: 'm-1', error: '' });
        const interaction = ownerInteraction('send', { name: 'peer-a', type: 'ping', payload: '{"hello":1}' });
        await cmd.execute(interaction);
        expect(mockClient.send).toHaveBeenCalled();
        const sent = mockClient.send.mock.calls[0]![0]!;
        expect(sent.target).toBe('peer-a');
        expect(sent.type).toBe('ping');
        const reply = interaction.editReply.mock.calls[0]![0]!;
        expect(reply.embeds[0].title).toBe('[SUCCESS] Message Sent');
    });

    it('should report not-found when removing an unknown bot', async () => {
        mockClient.getBotInfo.mockRejectedValue(new Error('not found'));
        const interaction = ownerInteraction('remove', { name: 'ghost' });
        await cmd.execute(interaction);
        const reply = interaction.editReply.mock.calls[0]![0]!;
        expect(reply.embeds[0].title).toBe('[WARNING] Not Found');
    });
});
