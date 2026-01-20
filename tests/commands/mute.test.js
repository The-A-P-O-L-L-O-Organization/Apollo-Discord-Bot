// Mute Command Tests
// Tests for the mute command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import muteCommand from '../../src/commands/mute.js';
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

describe('Mute Command', () => {
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
            roles: {
                cache: new Map(),
                create: vi.fn().mockResolvedValue({ id: 'muted-role-id', name: 'Muted' })
            }
        });
        
        targetMember = createMockMember({
            user: targetUser,
            guild: mockGuild,
            moderatable: true,
            roles: {
                cache: new Map(),
                add: vi.fn().mockResolvedValue({})
            }
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockImplementation((name) => {
                    if (name === 'duration') return '1h';
                    if (name === 'reason') return 'Spamming in chat';
                    return null;
                })
            }
        });

        fetchMember.mockResolvedValue(targetMember);
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(muteCommand.name).toBe('mute');
        });

        it('should have a description', () => {
            expect(muteCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(muteCommand.category).toBe('Moderation');
        });

        it('should require MuteMembers permission', () => {
            expect(muteCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(muteCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(muteCommand.options).toHaveLength(3);
            
            const userOption = muteCommand.options.find(o => o.name === 'user');
            expect(userOption.required).toBe(true);
            
            const durationOption = muteCommand.options.find(o => o.name === 'duration');
            expect(durationOption.required).toBe(false);
            
            const reasonOption = muteCommand.options.find(o => o.name === 'reason');
            expect(reasonOption.required).toBe(false);
        });
    });

    describe('execute - Success Cases', () => {
        it('should mute user successfully with timeout', async () => {
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                3600000, // 1 hour in ms
                'Spamming in chat'
            );
        });

        it('should reply with success embed', async () => {
            await muteCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Muted');
        });

        it('should include correct mute details in response', async () => {
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            expect(embed.description).toContain('TargetUser#0001');
            expect(embed.fields.some(f => f.name.includes('Duration'))).toBe(true);
            expect(embed.fields.some(f => f.name.includes('Reason'))).toBe(true);
        });

        it('should send mod log with duration', async () => {
            await muteCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'mute',
                    target: targetUser,
                    moderator: mockInteraction.user,
                    reason: 'Spamming in chat',
                    duration: expect.stringContaining('hour')
                })
            );
        });

        it('should use default 1 hour duration when none provided', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'reason') return 'Test reason';
                return null;
            });
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                3600000, // Default 1 hour
                'Test reason'
            );
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return '30m';
                return null;
            });
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                1800000, // 30 minutes
                'No reason provided'
            );
        });
    });

    describe('execute - Duration Parsing', () => {
        it('should parse minutes correctly', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return '30m';
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                1800000,
                expect.any(String)
            );
        });

        it('should parse hours correctly', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return '2h';
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                7200000,
                expect.any(String)
            );
        });

        it('should parse days correctly', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return '1d';
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                86400000,
                expect.any(String)
            );
        });

        it('should parse weeks correctly', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return '1w';
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                604800000,
                expect.any(String)
            );
        });

        it('should reject invalid duration format', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return 'invalid';
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Duration');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject duration over 28 days', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') return '5w';
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Duration Too Long');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject self-mute', async () => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
        });

        it('should reject when member not found', async () => {
            fetchMember.mockResolvedValue(null);
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Member Not Found');
        });

        it('should reject when member is not moderatable', async () => {
            targetMember.moderatable = false;
            fetchMember.mockResolvedValue(targetMember);
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Cannot Mute');
        });

        it('should handle timeout API error gracefully', async () => {
            targetMember.timeout.mockRejectedValue(new Error('API Error'));
            // Also make roles.add fail so it doesn't fallback
            targetMember.roles.add.mockRejectedValue(new Error('Role API Error'));
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(new Error('Cannot create role'));
            
            await muteCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
        });
    });

    describe('execute - Fallback to Mute Role', () => {
        it('should fallback to mute role when timeout fails', async () => {
            targetMember.timeout.mockRejectedValue(new Error('Timeout not supported'));
            
            // Set up existing mute role
            const muteRole = { id: 'mute-role-id', name: 'Muted' };
            mockGuild.roles = {
                cache: {
                    find: vi.fn().mockReturnValue(muteRole)
                }
            };
            
            await muteCommand.execute(mockInteraction);
            
            expect(targetMember.roles.add).toHaveBeenCalledWith(
                muteRole,
                expect.any(String)
            );
        });

        it('should create mute role if it does not exist', async () => {
            targetMember.timeout.mockRejectedValue(new Error('Timeout not supported'));
            
            mockGuild.roles = {
                cache: {
                    find: vi.fn().mockReturnValue(null)
                },
                create: vi.fn().mockResolvedValue({ id: 'new-mute-role', name: 'Muted' })
            };
            
            await muteCommand.execute(mockInteraction);
            
            expect(mockGuild.roles.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Muted',
                    permissions: []
                })
            );
        });
    });
});
