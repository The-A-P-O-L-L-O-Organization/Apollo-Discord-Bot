import { describe, it, expect, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createMockInteraction } from '../mocks/discord.js';
import type { MockCommandInteraction } from '../mocks/discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn().mockResolvedValue({ nextId: 1, subscriptions: [] }),
    setData: vi.fn().mockResolvedValue(undefined)
}));

import command from '../../src/plugins/integrations/commands/integration.js';

describe('integration command', () => {

    it('has the correct name', () => {
        expect(command.name).toBe('integration');
    });

    it('has subcommands add, remove, list', () => {
        const subcommands = command.options.filter((o: { name: string; type: number }) => o.type === 1).map((o: { name: string }) => o.name);
        expect(subcommands).toContain('add');
        expect(subcommands).toContain('remove');
        expect(subcommands).toContain('list');
    });

    it('add subcommand requires type, target, and channel options', () => {
        const addSub = command.options.find((o: { name: string }) => o.name === 'add');
        expect(addSub).toBeDefined();
        expect(addSub!.options!.find((o: { name: string }) => o.name === 'type')).toBeDefined();
        expect(addSub!.options!.find((o: { name: string }) => o.name === 'target')).toBeDefined();
        expect(addSub!.options!.find((o: { name: string }) => o.name === 'channel')).toBeDefined();
    });

    it('remove subcommand requires id option', () => {
        const removeSub = command.options.find((o: { name: string }) => o.name === 'remove');
        expect(removeSub).toBeDefined();
        expect(removeSub!.options!.find((o: { name: string }) => o.name === 'id')).toBeDefined();
    });

    it('execute with add subcommand replies successfully', async() => {
        const interaction = createMockInteraction({
            guildId: '789',
            options: {
                getSubcommand: () => 'add',
                getString: (name: string) => name === 'type' ? 'twitch' : 'shroud',
                getChannel: () => ({ id: '456', isTextBased: () => true })
            }
        });

        await command.execute(interaction as unknown as ChatInputCommandInteraction);
        expect((interaction as unknown as MockCommandInteraction).reply).toHaveBeenCalled();
    });
});
