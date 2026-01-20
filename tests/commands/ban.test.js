// Ban Command Tests
// Tests for the ban command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import banCommand from '../../src/commands/ban.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockMember,
    createMockGuild,
    createMockClient 
} from '../mocks/discord.js';

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined),
    fetchMember: vi.fn()
}));

import { sendModLog, fetchMember } from '../../src/utils/modLog.js';

describe('Ban Command', () => {
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
        
        targetMember = createMockMember({
            user: targetUser,
            bannable: true
        });
        
        mockGuild = createMockGuild({
            bans: {
                create: vi.fn().mockResolvedValue({})
            }
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            client: createMockClient({ user: createMockUser({ id: 'BOT_ID' }) }),
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockReturnValue('Breaking rules'),
                getInteger: vi.fn().mockReturnValue(0)
            }
        });

        fetchMember.mockResolvedValue(targetMember);
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(banCommand.name).toBe('ban');
        });

        it('should have a description', () => {
            expect(banCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(banCommand.category).toBe('Moderation');
        });

        it('should require BanMembers permission', () => {
            expect(banCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(banCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(banCommand.options).toHaveLength(3);
            
            const userOption = banCommand.options.find(o => o.name === 'user');
            expect(userOption.required).toBe(true);
            
            const reasonOption = banCommand.options.find(o => o.name === 'reason');
            expect(reasonOption.required).toBe(false);
            
            const deleteDaysOption = banCommand.options.find(o => o.name === 'delete-days');
            expect(deleteDaysOption.min_value).toBe(0);
            expect(deleteDaysOption.max_value).toBe(7);
        });
    });

    describe('execute - Success Cases', () => {
        it('should ban user successfully', async () => {
            await banCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalledWith('111222333', {
                reason: 'Breaking rules',
                deleteMessageDays: 0
            });
        });

        it('should reply with success embed', async () => {
            await banCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Banned');
        });

        it('should include correct ban details in response', async () => {
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            expect(embed.description).toContain('TargetUser#0001');
            expect(embed.fields.some(f => f.name.includes('Reason'))).toBe(true);
        });

        it('should send mod log', async () => {
            await banCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'ban',
                    target: targetUser,
                    moderator: mockInteraction.user,
                    reason: 'Breaking rules'
                })
            );
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);
            
            await banCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalledWith('111222333', {
                reason: 'No reason provided',
                deleteMessageDays: 0
            });
        });

        it('should use custom delete days', async () => {
            mockInteraction.options.getInteger.mockReturnValue(7);
            
            await banCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalledWith('111222333', {
                reason: 'Breaking rules',
                deleteMessageDays: 7
            });
        });

        it('should ban user not in server', async () => {
            fetchMember.mockResolvedValue(null);
            
            await banCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalled();
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await banCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject self-ban', async () => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject banning the bot', async () => {
            const botUser = createMockUser({ id: 'BOT_ID' });
            mockInteraction.options.getUser.mockReturnValue(botUser);
            
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Bot Protection');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when member is not bannable', async () => {
            targetMember.bannable = false;
            fetchMember.mockResolvedValue(targetMember);
            
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Cannot Ban');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle ban API error gracefully', async () => {
            mockGuild.bans.create.mockRejectedValue(new Error('API Error'));
            
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Delete Days Validation', () => {
        it('should accept 0 delete days', async () => {
            mockInteraction.options.getInteger.mockReturnValue(0);
            
            await banCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalled();
        });

        it('should accept 7 delete days', async () => {
            mockInteraction.options.getInteger.mockReturnValue(7);
            
            await banCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.create).toHaveBeenCalledWith('111222333', {
                reason: 'Breaking rules',
                deleteMessageDays: 7
            });
        });

        it('should reject negative delete days', async () => {
            mockInteraction.options.getInteger.mockReturnValue(-1);
            
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Value');
        });

        it('should reject delete days over 7', async () => {
            mockInteraction.options.getInteger.mockReturnValue(8);
            
            await banCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Value');
        });
    });
});
