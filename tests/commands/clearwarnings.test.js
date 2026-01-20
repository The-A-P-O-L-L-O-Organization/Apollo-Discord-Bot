// Clear Warnings Command Tests
// Tests for the clear warnings command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import clearWarningsCommand from '../../src/commands/clearwarnings.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild 
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getUserData: vi.fn(),
    setUserData: vi.fn(),
    removeFromUserArray: vi.fn()
}));

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined)
}));

import { getUserData, setUserData } from '../../src/utils/dataStore.js';
import { sendModLog } from '../../src/utils/modLog.js';

describe('ClearWarnings Command', () => {
    let mockInteraction;
    let targetUser;
    let mockGuild;

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
        });
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
        it('should clear all active warnings', async () => {
            const warnings = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now(), active: true },
                { id: 'warn-2', reason: 'Reason 2', timestamp: Date.now(), active: true }
            ];
            getUserData.mockReturnValue(warnings);
            mockInteraction.options.getString.mockReturnValue(null); // No warning ID

            await clearWarningsCommand.execute(mockInteraction);
            
            expect(setUserData).toHaveBeenCalled();
            const setCall = setUserData.mock.calls[0];
            const updatedWarnings = setCall[3];
            expect(updatedWarnings.every(w => w.active === false)).toBe(true);
        });

        it('should reply with success embed', async () => {
            getUserData.mockReturnValue([
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
            ]);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Warnings Cleared');
        });

        it('should send mod log', async () => {
            getUserData.mockReturnValue([
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
            ]);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction);
            
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
        it('should clear a specific warning by ID', async () => {
            const warnings = [
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now(), moderatorTag: 'Mod#0001' },
                { id: 'warn-2', reason: 'Reason 2', timestamp: Date.now(), moderatorTag: 'Mod#0001' }
            ];
            getUserData.mockReturnValue(warnings);
            mockInteraction.options.getString
                .mockReturnValueOnce('warn-1')  // warning-id
                .mockReturnValueOnce('Appeal accepted'); // reason

            await clearWarningsCommand.execute(mockInteraction);
            
            expect(setUserData).toHaveBeenCalled();
            const setCall = setUserData.mock.calls[0];
            const updatedWarnings = setCall[3];
            
            const clearedWarning = updatedWarnings.find(w => w.id === 'warn-1');
            expect(clearedWarning.active).toBe(false);
            expect(clearedWarning.clearReason).toBe('Appeal accepted');
            
            const otherWarning = updatedWarnings.find(w => w.id === 'warn-2');
            expect(otherWarning.active).not.toBe(false);
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle user with no warnings', async () => {
            getUserData.mockReturnValue([]);

            await clearWarningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('No Warnings');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle invalid warning ID', async () => {
            getUserData.mockReturnValue([
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
            ]);
            mockInteraction.options.getString
                .mockReturnValueOnce('invalid-id');

            await clearWarningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Warning Not Found');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle no active warnings when all are cleared', async () => {
            getUserData.mockReturnValue([
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now(), active: false }
            ]);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('No Active Warnings');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle errors gracefully', async () => {
            getUserData.mockImplementation(() => {
                throw new Error('Database error');
            });

            await clearWarningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Default Reason', () => {
        it('should use default reason when none provided', async () => {
            getUserData.mockReturnValue([
                { id: 'warn-1', reason: 'Reason 1', timestamp: Date.now() }
            ]);
            mockInteraction.options.getString.mockReturnValue(null);

            await clearWarningsCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    reason: 'No reason provided'
                })
            );
        });
    });
});
