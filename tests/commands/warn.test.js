// Warn Command Tests
// Tests for the warn command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import warnCommand from '../../src/commands/warn.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockMember,
    createMockGuild,
    createMockClient 
} from '../mocks/discord.js';

// Mock the dependencies
vi.mock('../../src/utils/dataStore.js', () => ({
    getUserData: vi.fn(),
    appendToUserArray: vi.fn(),
    generateId: vi.fn().mockReturnValue('test-warning-id'),
    getGuildData: vi.fn().mockReturnValue({}),
    setGuildData: vi.fn()
}));

vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined),
    fetchMember: vi.fn()
}));

vi.mock('../../src/config/config.js', () => ({
    config: {
        warnings: {
            thresholds: {
                mute: 3,
                kick: 5,
                ban: 7
            },
            muteDuration: 3600000,
            dmOnWarn: true
        },
        moderation: {
            defaultReason: 'No reason provided'
        }
    }
}));

import { getUserData, appendToUserArray, generateId, getGuildData } from '../../src/utils/dataStore.js';
import { sendModLog, fetchMember } from '../../src/utils/modLog.js';

describe('Warn Command', () => {
    let mockInteraction;
    let targetUser;
    let targetMember;
    let mockGuild;

    beforeEach(() => {
        vi.clearAllMocks();
        
        targetUser = createMockUser({ 
            id: '111222333', 
            tag: 'TargetUser#0001',
            bot: false 
        });
        
        mockGuild = createMockGuild({
            bans: { create: vi.fn().mockResolvedValue({}) }
        });
        
        targetMember = createMockMember({
            user: targetUser,
            guild: mockGuild,
            kickable: true,
            moderatable: true
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockReturnValue('Breaking server rules')
            }
        });

        fetchMember.mockResolvedValue(targetMember);
        getUserData.mockReturnValue([]);
        getGuildData.mockReturnValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(warnCommand.name).toBe('warn');
        });

        it('should have a description', () => {
            expect(warnCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(warnCommand.category).toBe('Moderation');
        });

        it('should require ModerateMembers permission', () => {
            expect(warnCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should have required user and reason options', () => {
            const userOption = warnCommand.options.find(o => o.name === 'user');
            const reasonOption = warnCommand.options.find(o => o.name === 'reason');
            
            expect(userOption.required).toBe(true);
            expect(reasonOption.required).toBe(true);
        });
    });

    describe('execute - Success Cases', () => {
        it('should warn user successfully', async () => {
            await warnCommand.execute(mockInteraction);
            
            expect(appendToUserArray).toHaveBeenCalledWith(
                'warnings',
                mockGuild.id,
                targetUser.id,
                expect.objectContaining({
                    id: 'test-warning-id',
                    reason: 'Breaking server rules',
                    moderatorId: '999888777',
                    active: true
                })
            );
        });

        it('should reply with success embed', async () => {
            await warnCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('[SUCCESS] User Warned');
        });

        it('should include warning count in response', async () => {
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: true }
            ]);
            
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0].data;
            const countField = embed.fields.find(f => f.name === 'Total Warnings');
            expect(countField.value).toBe('3'); // 2 existing + 1 new
        });

        it('should send mod log', async () => {
            await warnCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'warn',
                    target: targetUser,
                    moderator: mockInteraction.user,
                    reason: 'Breaking server rules'
                })
            );
        });

        it('should attempt to DM user', async () => {
            await warnCommand.execute(mockInteraction);
            
            expect(targetUser.send).toHaveBeenCalled();
        });

        it('should handle DM failure gracefully', async () => {
            targetUser.send.mockRejectedValue(new Error('Cannot DM user'));
            
            await warnCommand.execute(mockInteraction);
            
            // Should still succeed
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('[SUCCESS] User Warned');
            
            // Should indicate DM was not sent
            const dmField = replyCall.embeds[0].data.fields.find(f => f.name === 'DM Sent');
            expect(dmField.value).toBe('No');
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject warning bots', async () => {
            targetUser.bot = true;
            mockInteraction.options.getUser.mockReturnValue(targetUser);
            
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Target');
        });

        it('should reject self-warning', async () => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
        });

        it('should reject when member not found', async () => {
            fetchMember.mockResolvedValue(null);
            
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Member Not Found');
        });
    });

    describe('execute - Auto Punishment', () => {
        it('should auto-mute at 3 warnings', async () => {
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: true }
            ]);
            
            await warnCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                3600000,
                expect.stringContaining('Auto-mute')
            );
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const autoPunishField = replyCall.embeds[0].data.fields.find(
                f => f.name.includes('Auto-Punishment')
            );
            expect(autoPunishField.value).toContain('muted');
        });

        it('should auto-kick at 5 warnings', async () => {
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: true },
                { id: '3', active: true },
                { id: '4', active: true }
            ]);
            
            await warnCommand.execute(mockInteraction);
            
            expect(targetMember.kick).toHaveBeenCalledWith(
                expect.stringContaining('Auto-kick')
            );
        });

        it('should auto-ban at 7 warnings', async () => {
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: true },
                { id: '3', active: true },
                { id: '4', active: true },
                { id: '5', active: true },
                { id: '6', active: true }
            ]);
            
            await warnCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalledWith(
                targetUser.id,
                expect.objectContaining({
                    reason: expect.stringContaining('Auto-ban')
                })
            );
        });

        it('should only count active warnings', async () => {
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: false }, // Cleared warning
                { id: '3', active: true }
            ]);
            
            await warnCommand.execute(mockInteraction);
            
            // Should be 3 active warnings, trigger mute
            expect(targetMember.timeout).toHaveBeenCalled();
        });

        it('should handle auto-mute failure gracefully', async () => {
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: true }
            ]);
            targetMember.timeout.mockRejectedValue(new Error('Cannot mute'));
            
            await warnCommand.execute(mockInteraction);
            
            // Should still send success response
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('[SUCCESS] User Warned');
        });

        it('should show next threshold in response', async () => {
            getUserData.mockReturnValue([]);
            
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const thresholdField = replyCall.embeds[0].data.fields.find(
                f => f.name === 'Next Threshold'
            );
            expect(thresholdField).toBeTruthy();
            expect(thresholdField.value).toContain('mute');
        });

        it('should respect guild-specific thresholds', async () => {
            getGuildData.mockReturnValue({
                thresholds: {
                    mute: 5,
                    kick: 10,
                    ban: 15
                }
            });
            
            getUserData.mockReturnValue([
                { id: '1', active: true },
                { id: '2', active: true }
            ]);
            
            await warnCommand.execute(mockInteraction);
            
            // Should NOT auto-mute at 3 warnings with custom threshold of 5
            expect(targetMember.timeout).not.toHaveBeenCalled();
        });
    });

    describe('execute - Warning ID Generation', () => {
        it('should generate unique warning ID', async () => {
            await warnCommand.execute(mockInteraction);
            
            expect(generateId).toHaveBeenCalled();
            expect(appendToUserArray).toHaveBeenCalledWith(
                'warnings',
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ id: 'test-warning-id' })
            );
        });

        it('should include warning ID in response', async () => {
            await warnCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const idField = replyCall.embeds[0].data.fields.find(f => f.name === 'Warning ID');
            expect(idField.value).toBe('test-warning-id');
        });
    });
});
