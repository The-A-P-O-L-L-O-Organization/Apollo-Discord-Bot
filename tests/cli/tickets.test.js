import { describe, it, expect, vi, beforeEach } from 'vitest';
import ticketsCommands from '../../src/plugins/tickets/cli/index.js';

vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn()
}));

import { getGuildData } from '../../src/utils/db.js';

describe('tickets CLI commands', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exports the tickets plugin definition', () => {
        expect(ticketsCommands.name).toBe('tickets');
        expect(Array.isArray(ticketsCommands.commands)).toBe(true);
    });

    it('has a list command with execute function', () => {
        const list = ticketsCommands.commands.find(c => c.name === 'list');
        expect(list).toBeDefined();
        expect(typeof list.execute).toBe('function');
    });

    it('list returns open and closed counts', async() => {
        getGuildData.mockResolvedValue({
            openTickets: [{ id: '1', ticketNumber: 1, userId: 'u1', reason: 'help', status: 'open', priority: 'low' }],
            closedTickets: [{ ticketNumber: 2, userId: 'u2', closedAt: '2024-01-01' }]
        });
        const list = ticketsCommands.commands.find(c => c.name === 'list');
        const result = await list.execute({ guild: '123' });
        expect(result.openCount).toBe(1);
        expect(result.closedCount).toBe(1);
        expect(result.open[0].id).toBe('1');
        expect(result.closed[0].ticketNumber).toBe(2);
    });

    it('list handles empty data', async() => {
        getGuildData.mockResolvedValue({});
        const list = ticketsCommands.commands.find(c => c.name === 'list');
        const result = await list.execute({ guild: '123' });
        expect(result.openCount).toBe(0);
        expect(result.closedCount).toBe(0);
    });
});
