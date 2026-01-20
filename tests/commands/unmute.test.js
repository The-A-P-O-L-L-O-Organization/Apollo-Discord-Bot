// Unmute Command Tests
// Tests for the unmute command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import unmuteCommand from '../../src/commands/unmute.js';
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

describe('Unmute Command', () => {
    let mockInteraction;
    let targetUser;
    let targetMember;
    let mockGuild;
    let muteRole;

    beforeEach(() => {
        vi.clearAllMocks();
        
        targetUser = createMockUser({ 
            id: '111222333', 
            tag: 'MutedUser#0001',
            bot: false 
        });
        
        muteRole = {
            id: 'mute-role-123',
            name: 'Muted'
        };
        
        targetMember = createMockMember({
            user: targetUser,
            moderatable: true,
            isCommunicationDisabled: vi.fn().mockReturnValue(true),
            timeout: vi.fn().mockResolvedValue({}),
            roles: {
                cache: {
                    has: vi.fn().mockReturnValue(false),
                    some: vi.fn().mockReturnValue(false)
                },
                remove: vi.fn().mockResolvedValue({})
            }
        });
        
        mockGuild = createMockGuild({
            roles: {
                cache: {
                    find: vi.fn().mockReturnValue(null)
                }
            }
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            client: createMockClient({ user: createMockUser({ id: 'BOT_ID' }) }),
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockReturnValue('Timeout served')
            }
        });

        fetchMember.mockResolvedValue(targetMember);
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(unmuteCommand.name).toBe('unmute');
        });

        it('should have a description', () => {
            expect(unmuteCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(unmuteCommand.category).toBe('Moderation');
        });

        it('should require MuteMembers permission', () => {
            expect(unmuteCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(unmuteCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(unmuteCommand.options).toHaveLength(2);
            
            const userOption = unmuteCommand.options.find(o => o.name === 'user');
            expect(userOption.required).toBe(true);
            
            const reasonOption = unmuteCommand.options.find(o => o.name === 'reason');
            expect(reasonOption.required).toBe(false);
        });
    });

    describe('execute - Success Cases', () => {
        it('should unmute user with timeout successfully', async () => {
            await unmuteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(null, 'Timeout served');
        });

        it('should reply with success embed', async () => {
            await unmuteCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Unmuted');
        });

        it('should include correct unmute details in response', async () => {
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            expect(embed.description).toContain('MutedUser#0001');
            expect(embed.fields.some(f => f.name.includes('Reason'))).toBe(true);
            expect(embed.fields.some(f => f.name.includes('Moderator'))).toBe(true);
        });

        it('should send mod log', async () => {
            await unmuteCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'unmute',
                    target: targetUser,
                    moderator: mockInteraction.user,
                    reason: 'Timeout served'
                })
            );
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);
            
            await unmuteCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    reason: 'No reason provided'
                })
            );
        });

        it('should remove mute role if exists', async () => {
            mockGuild.roles.cache.find.mockReturnValue(muteRole);
            targetMember.roles.cache.has.mockReturnValue(true);
            targetMember.isCommunicationDisabled.mockReturnValue(false);
            targetMember.roles.cache.some.mockReturnValue(true);
            
            await unmuteCommand.execute(mockInteraction);
            
            expect(targetMember.roles.remove).toHaveBeenCalledWith(muteRole, 'Timeout served');
        });

        it('should remove both timeout and mute role', async () => {
            mockGuild.roles.cache.find.mockReturnValue(muteRole);
            targetMember.roles.cache.has.mockReturnValue(true);
            
            await unmuteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalled();
            expect(targetMember.roles.remove).toHaveBeenCalled();
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await unmuteCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when member not found', async () => {
            fetchMember.mockResolvedValue(null);
            
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Member Not Found');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when member is not moderatable', async () => {
            targetMember.moderatable = false;
            fetchMember.mockResolvedValue(targetMember);
            
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Cannot Unmute');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject self-unmute', async () => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            fetchMember.mockResolvedValue(createMockMember({ 
                user: sameUser, 
                moderatable: true,
                isCommunicationDisabled: vi.fn().mockReturnValue(true)
            }));
            
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when user is not muted', async () => {
            targetMember.isCommunicationDisabled.mockReturnValue(false);
            targetMember.roles.cache.some.mockReturnValue(false);
            fetchMember.mockResolvedValue(targetMember);
            
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Not Muted');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle API error gracefully', async () => {
            targetMember.timeout.mockRejectedValue(new Error('API Error'));
            targetMember.isCommunicationDisabled.mockReturnValue(true);
            
            // Mute role doesn't exist, so it should fail on timeout
            await unmuteCommand.execute(mockInteraction);
            
            // Should still complete but may have logged error
            expect(mockInteraction.reply).toHaveBeenCalled();
        });
    });

    describe('execute - Mute Detection', () => {
        it('should detect user muted via timeout', async () => {
            targetMember.isCommunicationDisabled.mockReturnValue(true);
            targetMember.roles.cache.some.mockReturnValue(false);
            
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Unmuted');
        });

        it('should detect user muted via role', async () => {
            targetMember.isCommunicationDisabled.mockReturnValue(false);
            targetMember.roles.cache.some.mockImplementation((fn) => {
                return fn({ name: 'Muted' });
            });
            mockGuild.roles.cache.find.mockReturnValue(muteRole);
            targetMember.roles.cache.has.mockReturnValue(true);
            
            await unmuteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Unmuted');
        });
    });
});
