import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
    createMockInteraction,
    createMockUser,
    createMockChannel,
    createMockGuild
} from '../mocks/discord.js';
import type { MockCommandInteraction } from '../mocks/discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getAllGuildData: vi.fn(),
    setGuildData: vi.fn(),
    getUserData: vi.fn(),
    setUserData: vi.fn()
}));

import { getAllGuildData, getUserData } from '../../src/utils/db.js';
import dataRequestCommand from '../../src/plugins/utility/commands/datarequest.js';

describe('/data-request command', () => {
    let mockInteraction: MockCommandInteraction;

    beforeEach(() => {
        vi.clearAllMocks();

        mockInteraction = createMockInteraction({
            user: createMockUser({ id: 'u1', tag: 'TestUser#0001' }),
            channel: createMockChannel({ id: 'channel123' }),
            guild: createMockGuild({ id: 'guild123' })
        }) as unknown as MockCommandInteraction;
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(dataRequestCommand.name).toBe('data-request');
        });

        it('should have a description', () => {
            expect(dataRequestCommand.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(dataRequestCommand.category).toBe('Utility');
        });

        it('should allow DM usage', () => {
            expect(dataRequestCommand.dmPermission).toBe(true);
        });
    });

    it('returns summary of all user data across stores', async () => {
        vi.mocked(getAllGuildData).mockImplementation((store: string) => {
            if (store === 'warnings') {
                return Promise.resolve([
                    { guildId: 'g1', data: { warnings: [{ userId: 'u1', reason: 'test' }] } }
                ]);
            }
            if (store === 'config') {
                return Promise.resolve([{ guildId: 'g1', data: {} }]);
            }
            return Promise.resolve([]);
        });
        vi.mocked(getUserData).mockImplementation((store: string, _guildId: string, userId: string) => {
            if (store === 'user' && userId === 'u1') {
                return Promise.resolve({ language: 'en-US', timezone: 'UTC' });
            }
            return Promise.resolve(undefined);
        });

        await dataRequestCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) })
        );
        const call = vi.mocked(mockInteraction.editReply).mock.calls[0]?.[0] as { embeds: Array<{ data?: Record<string, unknown> }> };
        const flat = JSON.stringify(call.embeds[0]);
        expect(flat).toContain('warnings');
        expect(flat).toContain('user');
    });

    it('includes automod threat scores and interlink data', async () => {
        vi.mocked(getAllGuildData).mockImplementation((store: string) => {
            if (store === 'automod') {
                return Promise.resolve([
                    { guildId: 'g1', data: { threatScores: [{ userId: 'u1', score: 5 }] } }
                ]);
            }
            if (store === 'config') {
                return Promise.resolve([{ guildId: 'g1', data: {} }]);
            }
            return Promise.resolve([]);
        });
        vi.mocked(getUserData).mockResolvedValue(undefined);

        await expect(
            dataRequestCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction)
        ).resolves.not.toThrow();
        expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('handles users with no data gracefully', async () => {
        vi.mocked(getAllGuildData).mockResolvedValue([]);
        vi.mocked(getUserData).mockResolvedValue(undefined);

        await dataRequestCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) })
        );
        const call = vi.mocked(mockInteraction.editReply).mock.calls[0]?.[0] as { embeds: Array<{ data?: Record<string, unknown> }> };
        expect(JSON.stringify(call.embeds[0]).toLowerCase()).toContain('no data');
    });
});
