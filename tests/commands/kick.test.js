// Kick Command Tests
// Tests for the kick command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import kickCommand from '../../src/commands/kick.js';
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

describe('Kick Command', () => {
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
        
        mockGuild = createMockGuild();
        
        targetMember = createMockMember({
            user: targetUser,
            guild: mockGuild,
            kickable: true
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockReturnValue('Violating server rules')
            }
        });

        fetchMember.mockResolvedValue(targetMember);
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(kickCommand.name).toBe('kick');
        });

        it('should have a description', () => {
            expect(kickCommand.description).toBeTruthy();
            expect(typeof kickCommand.description).toBe('string');
        });

        it('should be in Moderation category', () => {
            expect(kickCommand.category).toBe('Moderation');
        });

        it('should require KickMembers permission', () => {
            expect(kickCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(kickCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(kickCommand.options).toHaveLength(2);
            
            const userOption = kickCommand.options.find(o => o.name === 'user');
            expect(userOption.required).toBe(true);
            expect(userOption.type).toBe(6); // USER type
            
            const reasonOption = kickCommand.options.find(o => o.name === 'reason');
            expect(reasonOption.required).toBe(false);
            expect(reasonOption.type).toBe(3); // STRING type
        });
    });

    describe('execute - Success Cases', () => {
        it('should kick user successfully', async () => {
            await kickCommand.execute(mockInteraction);
            
            expect(targetMember.kick).toHaveBeenCalledWith('Violating server rules');
        });

        it('should reply with success embed', async () => {
            await kickCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Kicked');
        });

        it('should include correct kick details in response', async () => {
            await kickCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            expect(embed.description).toContain('TargetUser#0001');
            expect(embed.fields.some(f => f.name.includes('Reason'))).toBe(true);
            expect(embed.fields.some(f => f.name.includes('Moderator'))).toBe(true);
            expect(embed.fields.some(f => f.name.includes('User ID'))).toBe(true);
        });

        it('should send mod log', async () => {
            await kickCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'kick',
                    target: targetUser,
                    moderator: mockInteraction.user,
                    reason: 'Violating server rules'
                })
            );
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);
            
            await kickCommand.execute(mockInteraction);
            
            expect(targetMember.kick).toHaveBeenCalledWith('No reason provided');
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await kickCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject self-kick', async () => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            
            await kickCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when member not found', async () => {
            fetchMember.mockResolvedValue(null);
            
            await kickCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Member Not Found');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when member is not kickable', async () => {
            targetMember.kickable = false;
            fetchMember.mockResolvedValue(targetMember);
            
            await kickCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Cannot Kick');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle kick API error gracefully', async () => {
            targetMember.kick.mockRejectedValue(new Error('API Error'));
            
            await kickCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle very long reasons', async () => {
            const longReason = 'x'.repeat(500);
            mockInteraction.options.getString.mockReturnValue(longReason);
            
            await kickCommand.execute(mockInteraction);
            
            expect(targetMember.kick).toHaveBeenCalledWith(longReason);
        });

        it('should handle special characters in reason', async () => {
            const specialReason = 'Breaking rules: <script>alert("xss")</script>';
            mockInteraction.options.getString.mockReturnValue(specialReason);
            
            await kickCommand.execute(mockInteraction);
            
            expect(targetMember.kick).toHaveBeenCalledWith(specialReason);
        });
    });
});
