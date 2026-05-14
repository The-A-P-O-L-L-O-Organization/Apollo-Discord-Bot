import { describe, it, expect, vi } from 'vitest';
import { createMockInteraction } from '../mocks/discord.js';

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
        const subcommands = command.options.filter(o => o.type === 1).map(o => o.name);
        expect(subcommands).toContain('add');
        expect(subcommands).toContain('remove');
        expect(subcommands).toContain('list');
    });

    it('add subcommand requires type, target, and channel options', () => {
        const addSub = command.options.find(o => o.name === 'add');
        expect(addSub).toBeDefined();
        expect(addSub.options.find(o => o.name === 'type')).toBeDefined();
        expect(addSub.options.find(o => o.name === 'target')).toBeDefined();
        expect(addSub.options.find(o => o.name === 'channel')).toBeDefined();
    });

    it('remove subcommand requires id option', () => {
        const removeSub = command.options.find(o => o.name === 'remove');
        expect(removeSub).toBeDefined();
        expect(removeSub.options.find(o => o.name === 'id')).toBeDefined();
    });

    it('execute with add subcommand replies successfully', async() => {
        const interaction = createMockInteraction({
            guildId: '789',
            options: {
                getSubcommand: () => 'add',
                getString: (name) => name === 'type' ? 'twitch' : 'shroud',
                getChannel: () => ({ id: '456', isTextBased: () => true })
            }
        });

        await command.execute(interaction);
        expect(interaction.reply).toHaveBeenCalled();
    });
});
