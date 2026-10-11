import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn(),
    setData: vi.fn()
}));

import { getData, setData } from '../../src/utils/db.js';
import { checkTempbans } from '../../src/utils/tempbanScheduler.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);

function createMockGuild(removeImpl?: () => Promise<unknown>) {
    const remove = vi.fn(() => removeImpl ? removeImpl() : Promise.resolve({}));
    return {
        bans: { remove },
        channels: { cache: { find: vi.fn(() => undefined) } }
    };
}

function createMockClient(guild: unknown) {
    return {
        guilds: { fetch: vi.fn(() => Promise.resolve(guild)) }
    } as unknown as Client;
}

describe('tempbanScheduler idempotency', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('claims expired tempbans in the database before calling the Discord API', async () => {
        const now = Date.now();
        const expired = { guildId: 'g1', userId: 'u1', unbanAt: now - 1000, bannedAt: now - 5000 };
        const future = { guildId: 'g1', userId: 'u2', unbanAt: now + 60000, bannedAt: now - 5000 };
        mockGetData.mockResolvedValue({ tempbans: [expired, future] } as never);

        const guild = createMockGuild();
        await checkTempbans(createMockClient(guild));

        expect(mockSetData).toHaveBeenCalledTimes(1);
        expect(guild.bans.remove).toHaveBeenCalledTimes(1);
        expect(guild.bans.remove).toHaveBeenCalledWith('u1', 'Temporary ban expired');
        const written = mockSetData.mock.calls[0]?.[1] as unknown as { tempbans: unknown[] };
        expect(written.tempbans).toEqual([future]);
        expect(mockSetData.mock.invocationCallOrder[0]).toBeLessThan(
            (guild.bans.remove as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0] ?? 0
        );
    });

    it('does not re-process claimed tempbans on the next run', async () => {
        const now = Date.now();
        const expired = { guildId: 'g1', userId: 'u1', unbanAt: now - 1000, bannedAt: now - 5000 };
        const future = { guildId: 'g1', userId: 'u2', unbanAt: now + 60000, bannedAt: now - 5000 };
        mockGetData.mockResolvedValueOnce({ tempbans: [expired, future] } as never);
        mockGetData.mockResolvedValueOnce({ tempbans: [future] } as never);

        const guild = createMockGuild();
        const client = createMockClient(guild);

        await checkTempbans(client);
        await checkTempbans(client);

        expect(guild.bans.remove).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('does not re-process after a crash between the Discord call and the next tick', async () => {
        const now = Date.now();
        const expired = { guildId: 'g1', userId: 'u1', unbanAt: now - 1000, bannedAt: now - 5000 };
        mockGetData.mockResolvedValueOnce({ tempbans: [expired] } as never);
        mockGetData.mockResolvedValueOnce({ tempbans: [] } as never);

        const guild = createMockGuild();
        const client = createMockClient(guild);

        await checkTempbans(client);
        await checkTempbans(client);

        expect(guild.bans.remove).toHaveBeenCalledTimes(1);
    });

    it('treats an already-lifted ban as handled without requeueing', async () => {
        const now = Date.now();
        const expired = { guildId: 'g1', userId: 'u1', unbanAt: now - 1000, bannedAt: now - 5000 };
        mockGetData.mockResolvedValue({ tempbans: [expired] } as never);

        const guild = createMockGuild(() => Promise.reject({ code: 10026, message: 'Unknown Ban' }));
        await checkTempbans(createMockClient(guild));

        expect(guild.bans.remove).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('requeues the tempban when the unban call fails', async () => {
        const now = Date.now();
        const expired = { guildId: 'g1', userId: 'u1', unbanAt: now - 1000, bannedAt: now - 5000 };
        mockGetData.mockResolvedValueOnce({ tempbans: [expired] } as never);
        mockGetData.mockResolvedValueOnce({ tempbans: [] } as never);

        const guild = createMockGuild(() => Promise.reject(new Error('Discord outage')));
        await checkTempbans(createMockClient(guild));

        expect(mockSetData).toHaveBeenCalledTimes(2);
        const requeued = mockSetData.mock.calls[1]?.[1] as unknown as { tempbans: unknown[] };
        expect(requeued.tempbans).toEqual([expired]);
    });

    it('does nothing when no client is available', async () => {
        mockGetData.mockResolvedValue({ tempbans: [{ guildId: 'g1', userId: 'u1', unbanAt: 1, bannedAt: 0 }] } as never);

        await checkTempbans(undefined);

        expect(mockGetData).not.toHaveBeenCalled();
        expect(mockSetData).not.toHaveBeenCalled();
    });
});
