import { describe, it, expect, vi, beforeEach } from 'vitest';
import integrationsCommands from '../../src/plugins/integrations/cli/index.js';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn()
}));

import { getData } from '../../src/utils/db.js';

describe('integrations CLI commands', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exports the integrations plugin definition', () => {
        expect(integrationsCommands.name).toBe('integrations');
        expect(Array.isArray(integrationsCommands.commands)).toBe(true);
    });

    it('has a list command with execute function', () => {
        const list = integrationsCommands.commands.find(c => c.name === 'list');
        expect(list).toBeDefined();
        expect(typeof list.execute).toBe('function');
    });

    it('list returns subscription count', async () => {
        getData.mockResolvedValue({
            subscriptions: [{ id: 's1', guild_id: 'g1', type: 'twitch', target_id: 't1', channel_id: 'c1' }]
        });
        const list = integrationsCommands.commands.find(c => c.name === 'list');
        const result = await list.execute({ guild: '123' });
        expect(result.count).toBe(1);
        expect(result.subscriptions[0].type).toBe('twitch');
    });

    it('list handles empty data', async () => {
        getData.mockResolvedValue({});
        const list = integrationsCommands.commands.find(c => c.name === 'list');
        const result = await list.execute({ guild: '123' });
        expect(result.count).toBe(0);
    });
});
