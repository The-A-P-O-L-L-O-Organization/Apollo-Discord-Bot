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
    getAllGuildIds: vi.fn(),
    setGuildData: vi.fn(),
    getUserData: vi.fn(),
    setUserData: vi.fn()
}));

import { getAllGuildData, getAllGuildIds, getUserData } from '../../src/utils/db.js';
import dataExportCommand from '../../src/plugins/utility/commands/dataexport.js';

describe('/export-my-data command', () => {
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
            expect(dataExportCommand.name).toBe('export-my-data');
        });

        it('should have a description', () => {
            expect(dataExportCommand.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(dataExportCommand.category).toBe('Utility');
        });

        it('should allow DM usage', () => {
            expect(dataExportCommand.dmPermission).toBe(true);
        });
    });

    it('exports all user data as structured JSON', async () => {
        vi.mocked(getAllGuildData).mockImplementation((store: string) => {
            if (store === 'warnings') {
                return Promise.resolve([
                    { guildId: 'g1', data: { warnings: [{ userId: 'u1', reason: 'test' }] } }
                ]);
            }
            return Promise.resolve([]);
        });
        vi.mocked(getAllGuildIds).mockResolvedValue(['g1']);
        vi.mocked(getUserData).mockImplementation((store: string, _guildId: string, userId: string) => {
            if (store === 'user' && userId === 'u1') {
                return Promise.resolve({ language: 'en-US', timezone: 'UTC' });
            }
            return Promise.resolve(undefined);
        });

        await dataExportCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalled();
        expect(mockInteraction.user.send).toHaveBeenCalledWith(
            expect.objectContaining({ files: expect.any(Array) })
        );
        const sendCall = vi.mocked(mockInteraction.user.send).mock.calls[0]?.[0] as { files: Array<{ name?: string }> };
        expect(sendCall.files).toHaveLength(1);
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) })
        );
    });

    it('includes all data categories from DATA_INVENTORY', async () => {
        vi.mocked(getAllGuildData).mockImplementation((store: string) => {
            if (store === 'warnings') {
                return Promise.resolve([
                    { guildId: 'g1', data: { warnings: [{ userId: 'u1', reason: 'test' }] } }
                ]);
            }
            if (store === 'tickets') {
                return Promise.resolve([
                    { guildId: 'g1', data: { openTickets: [{ creatorId: 'u1', participants: [] }] } }
                ]);
            }
            return Promise.resolve([]);
        });
        vi.mocked(getAllGuildIds).mockResolvedValue(['g1']);
        vi.mocked(getUserData).mockImplementation((store: string, _guildId: string, userId: string) => {
            if (store === 'levels' && userId === 'u1') {
                return Promise.resolve({ xp: 100, level: 2 });
            }
            return Promise.resolve(undefined);
        });

        await dataExportCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(vi.mocked(getAllGuildData)).toHaveBeenCalledWith('warnings');
        expect(vi.mocked(getAllGuildData)).toHaveBeenCalledWith('tickets');
        expect(vi.mocked(getUserData)).toHaveBeenCalledWith('levels', 'g1', 'u1');
        expect(mockInteraction.user.send).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('handles DM failure gracefully', async () => {
        vi.mocked(getAllGuildData).mockResolvedValue([]);
        vi.mocked(getAllGuildIds).mockResolvedValue([]);
        vi.mocked(mockInteraction.user.send).mockRejectedValueOnce(new Error('Cannot send messages to this user'));

        await dataExportCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) })
        );
        const call = vi.mocked(mockInteraction.editReply).mock.calls[0]?.[0] as { embeds: Array<{ data?: Record<string, unknown> }> };
        expect(JSON.stringify(call.embeds[0]).toLowerCase()).toContain('could not');
    });
});
