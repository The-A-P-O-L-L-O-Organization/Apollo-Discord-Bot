import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn()
}));

import { getGuildData, setGuildData } from '../../src/utils/db.js';
import { checkExpiredTempRoles } from '../../src/utils/tempRolesScheduler.js';

const mockGetGuildData = vi.mocked(getGuildData);
const mockSetGuildData = vi.mocked(setGuildData);

function createMockGuild(removeImpl?: () => Promise<unknown>) {
    const rolesRemove = vi.fn(() => removeImpl ? removeImpl() : Promise.resolve({}));
    const member = {
        roles: { cache: { has: vi.fn(() => true) }, remove: rolesRemove },
        user: { tag: 'user#1', send: vi.fn(() => Promise.resolve({})) }
    };
    return {
        guild: {
            name: 'Test Guild',
            members: { fetch: vi.fn(() => Promise.resolve(member)) },
            roles: { cache: { get: vi.fn(() => ({ id: 'role1', name: 'Temp' })) } }
        },
        member,
        rolesRemove
    };
}

function createMockClient(guilds: Map<string, unknown>) {
    return { guilds: { cache: guilds } } as unknown as Client;
}

describe('tempRolesScheduler idempotency', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('reads per-guild temp roles and claims expired entries before calling the Discord API', async () => {
        const now = Date.now();
        const stored = {
            u1: { roleId: 'role1', expiresAt: now - 1000 },
            u2: { roleId: 'role1', expiresAt: now + 60000 }
        };
        mockGetGuildData.mockResolvedValue(stored as never);

        const { guild, rolesRemove } = createMockGuild();
        await checkExpiredTempRoles(createMockClient(new Map([['g1', guild]])));

        expect(mockGetGuildData).toHaveBeenCalledWith('temp-roles', 'g1');
        expect(mockSetGuildData).toHaveBeenCalledTimes(1);
        expect(rolesRemove).toHaveBeenCalledTimes(1);
        expect(mockSetGuildData).toHaveBeenCalledWith(
            'temp-roles',
            'g1',
            { u2: { roleId: 'role1', expiresAt: stored.u2.expiresAt } }
        );
        expect(mockSetGuildData.mock.invocationCallOrder[0]).toBeLessThan(
            rolesRemove.mock.invocationCallOrder[0] ?? 0
        );
    });

    it('does not re-remove claimed temp roles on the next run', async () => {
        const now = Date.now();
        mockGetGuildData.mockResolvedValueOnce({ u1: { roleId: 'role1', expiresAt: now - 1000 } } as never);
        mockGetGuildData.mockResolvedValueOnce({} as never);

        const { guild, rolesRemove } = createMockGuild();
        const client = createMockClient(new Map([['g1', guild]]));

        await checkExpiredTempRoles(client);
        await checkExpiredTempRoles(client);

        expect(rolesRemove).toHaveBeenCalledTimes(1);
        expect(mockSetGuildData).toHaveBeenCalledTimes(1);
    });

    it('treats a member that no longer holds the role as handled without requeueing', async () => {
        const now = Date.now();
        mockGetGuildData.mockResolvedValue({ u1: { roleId: 'role1', expiresAt: now - 1000 } } as never);

        const { guild, member, rolesRemove } = createMockGuild();
        vi.mocked(member.roles.cache.has).mockReturnValue(false);
        await checkExpiredTempRoles(createMockClient(new Map([['g1', guild]])));

        expect(rolesRemove).not.toHaveBeenCalled();
        expect(mockSetGuildData).toHaveBeenCalledTimes(1);
    });

    it('requeues the temp role when role removal fails', async () => {
        const now = Date.now();
        const expired = { roleId: 'role1', expiresAt: now - 1000 };
        mockGetGuildData.mockResolvedValueOnce({ u1: expired } as never);
        mockGetGuildData.mockResolvedValueOnce({} as never);

        const { guild, rolesRemove } = createMockGuild(() => Promise.reject(new Error('Missing permissions')));
        await checkExpiredTempRoles(createMockClient(new Map([['g1', guild]])));

        expect(rolesRemove).toHaveBeenCalledTimes(1);
        expect(mockSetGuildData).toHaveBeenCalledTimes(2);
        expect(mockSetGuildData).toHaveBeenCalledWith('temp-roles', 'g1', { u1: expired });
    });

    it('skips guilds with no temp roles without writing', async () => {
        mockGetGuildData.mockResolvedValue({} as never);

        const { guild } = createMockGuild();
        await checkExpiredTempRoles(createMockClient(new Map([['g1', guild]])));

        expect(mockSetGuildData).not.toHaveBeenCalled();
    });
});
