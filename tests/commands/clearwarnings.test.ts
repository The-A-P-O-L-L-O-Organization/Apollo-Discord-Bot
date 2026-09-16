// Clear Warnings Command Tests
// Tests for the clear warnings command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Guild, User } from 'discord.js';
import clearWarningsCommand from '../../src/plugins/moderation/commands/clearwarnings.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild 
} from '../mocks/discord.js';
import type { MockCommandInteraction, MockGuild, MockUser } from '../mocks/discord.js';

// Mock the db module
vi.mock('../../src/utils/db.js', () => ({
    getUserData: vi.fn(),
    setUserData: vi.fn(),
    removeFromUserArray: vi.fn(),
    updateGuildData: vi.fn((store, guildId, updater) => {
        return Promise.resolve(updater({ nextCaseId: 1 }));
    })
}));

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined)
}));

import { getUserData, setUserData } from '../../src/utils/db.js';
import { sendModLog } from '../../src/utils/modLog.js';

describe('ClearWarnings Command', () => {
    let mockInteraction: MockCommandInteraction;
    let targetUser: MockUser;
    let mockGuild: MockGuild;

    beforeEach(() => {
        vi.clearAllMocks();
        
        targetUser = createMockUser({ 
            id: '111222333', 
            tag: 'TargetUser#0001' 
        });
        
        mockGuild = createMockGuild({ id: '987654321' });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn()
            }
        }) as unknown as MockCommandInteraction;
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(clearWarningsCommand.name).toBe('clearwarnings');
        });

        it('should have a description', () => {
            expect(clearWarningsCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(clearWarningsCommand.category).toBe('Moderation');
        });

        it('should require ModerateMembers permission', () => {
            expect(clearWarningsCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(clearWarningsCommand.dmPermission).toBe(false);
        });
    });

    describe('execute - Clear All Warnings', () => {
        it('should clear all active warnings', async() => {
            const warnings = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now(), active: true },
                { id: 'warn-2', reason: 'Reason 2', timestamp: Date.now(), active: true }
            ];
            vi.mocked(getUserData).mockResolvedValue(warnings as unknown as Record<string, unknown>);
            mockInteraction.options.getString.mockReturnValue(null); // No warning ID

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setUserData).toHaveBeenCalled();
            const setCall = vi.mocked(setUserData).mock.calls[0]!;
            const updatedWarnings = setCall[3] as unknown as Array<{ active: boolean; id?: string }>;
            expect(updatedWarnings.every((w: { active: boolean }) => w.active === false)).toBe(true);
        });

        it('should reply with success embed', async() => {
            const mockData1 = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
                        ];
                        vi.mocked(getUserData).mockResolvedValue(mockData1 as unknown as Awaited<ReturnType<typeof getUserData>>);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Warnings Cleared');
        });

        it('should send mod log', async() => {
            const mockData2 = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
                        ];
                        vi.mocked(getUserData).mockResolvedValue(mockData2 as unknown as Awaited<ReturnType<typeof getUserData>>);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'clearwarnings',
                    target: targetUser,
                    moderator: mockInteraction.user
                })
            );
        });
    });

    describe('execute - Clear Specific Warning', () => {
        it('should clear a specific warning by ID', async() => {
            const warnings = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now(), moderatorTag: 'Mod#0001' },
                { id: 'warn-2', reason: 'Reason 2', timestamp: Date.now(), moderatorTag: 'Mod#0001' }
            ];
            vi.mocked(getUserData).mockResolvedValue(warnings as unknown as Record<string, unknown>);
            mockInteraction.options.getString
                .mockReturnValueOnce('warn-1')  // warning-id
                .mockReturnValueOnce('Appeal accepted'); // reason

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setUserData).toHaveBeenCalled();
            const setCall = vi.mocked(setUserData).mock.calls[0]!;
            const updatedWarnings = setCall[3] as unknown as Array<{ id: string; active: boolean; clearReason?: string }>;
            
            const clearedWarning = updatedWarnings.find((w: { id: string }) => w.id === 'warn-1');
            expect(clearedWarning!.active).toBe(false);
            expect(clearedWarning!.clearReason).toBe('Appeal accepted');
            
            const otherWarning = updatedWarnings.find((w: { id: string }) => w.id === 'warn-2');
            expect(otherWarning!.active).not.toBe(false);
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async() => {
            mockInteraction.options.getUser.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle user with no warnings', async() => {
            const mockData3: Array<unknown> = [];
                        vi.mocked(getUserData).mockResolvedValue(mockData3 as unknown as Awaited<ReturnType<typeof getUserData>>);

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('No Warnings');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle invalid warning ID', async() => {
            const mockData4 = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
                        ];
                        vi.mocked(getUserData).mockResolvedValue(mockData4 as unknown as Awaited<ReturnType<typeof getUserData>>);
            mockInteraction.options.getString
                .mockReturnValueOnce('invalid-id');

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Warning Not Found');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle no active warnings when all are cleared', async() => {
            const mockData5 = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now(), active: false }
                        ];
                        vi.mocked(getUserData).mockResolvedValue(mockData5 as unknown as Awaited<ReturnType<typeof getUserData>>);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('No Active Warnings');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle errors gracefully', async() => {
            vi.mocked(getUserData).mockImplementation(() => {
                throw new Error('Database error');
            });

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - Default Reason', () => {
        it('should use default reason when none provided', async() => {
            const mockData6 = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
                        ];
                        vi.mocked(getUserData).mockResolvedValue(mockData6 as unknown as Awaited<ReturnType<typeof getUserData>>);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    reason: 'No reason provided'
                })
            );
        });
    });
});
