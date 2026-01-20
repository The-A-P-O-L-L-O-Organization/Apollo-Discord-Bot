// Unban Command Tests
// Tests for the unban command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import unbanCommand from '../../src/commands/unban.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild,
    createMockClient 
} from '../mocks/discord.js';

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined)
}));

import { sendModLog } from '../../src/utils/modLog.js';

describe('Unban Command', () => {
    let mockInteraction;
    let mockGuild;
    let bannedUser;

    beforeEach(() => {
        vi.clearAllMocks();
        
        bannedUser = createMockUser({ 
            id: '111222333444555666', 
            tag: 'BannedUser#0001',
            bot: false 
        });
        
        mockGuild = createMockGuild({
            bans: {
                fetch: vi.fn().mockResolvedValue({ user: bannedUser }),
                remove: vi.fn().mockResolvedValue({})
            }
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            client: createMockClient({ user: createMockUser({ id: 'BOT_ID' }) }),
            options: {
                getString: vi.fn().mockImplementation((name) => {
                    if (name === 'user-id') return '111222333444555666';
                    if (name === 'reason') return 'Appeal accepted';
                    return null;
                })
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(unbanCommand.name).toBe('unban');
        });

        it('should have a description', () => {
            expect(unbanCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(unbanCommand.category).toBe('Moderation');
        });

        it('should require BanMembers permission', () => {
            expect(unbanCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(unbanCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(unbanCommand.options).toHaveLength(2);
            
            const userIdOption = unbanCommand.options.find(o => o.name === 'user-id');
            expect(userIdOption.required).toBe(true);
            
            const reasonOption = unbanCommand.options.find(o => o.name === 'reason');
            expect(reasonOption.required).toBe(false);
        });
    });

    describe('execute - Success Cases', () => {
        it('should unban user successfully', async () => {
            await unbanCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.remove).toHaveBeenCalledWith(
                '111222333444555666',
                'Appeal accepted'
            );
        });

        it('should reply with success embed', async () => {
            await unbanCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Unbanned');
        });

        it('should include correct unban details in response', async () => {
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            expect(embed.description).toContain('BannedUser#0001');
            expect(embed.fields.some(f => f.name.includes('Reason'))).toBe(true);
            expect(embed.fields.some(f => f.name.includes('Moderator'))).toBe(true);
            expect(embed.fields.some(f => f.name.includes('User ID'))).toBe(true);
        });

        it('should send mod log', async () => {
            await unbanCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'unban',
                    target: bannedUser,
                    moderator: mockInteraction.user,
                    reason: 'Appeal accepted'
                })
            );
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return '111222333444555666';
                return null;
            });
            
            await unbanCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.remove).toHaveBeenCalledWith(
                '111222333444555666',
                'No reason provided'
            );
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user ID specified', async () => {
            mockInteraction.options.getString.mockReturnValue(null);
            
            await unbanCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Missing User ID');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid user ID format (too short)', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return '12345';
                return null;
            });
            
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid User ID');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid user ID format (non-numeric)', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return 'not-a-valid-id';
                return null;
            });
            
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid User ID');
        });

        it('should reject when user is not banned', async () => {
            mockGuild.bans.fetch.mockResolvedValue(null);
            
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Not Banned');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle ban fetch returning null', async () => {
            mockGuild.bans.fetch.mockImplementation(() => Promise.resolve(null));
            
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Not Banned');
        });

        it('should handle unban API error gracefully', async () => {
            mockGuild.bans.remove.mockRejectedValue(new Error('API Error'));
            
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].title).toContain('Command Failed');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - User ID Validation', () => {
        it('should accept valid 17-digit user ID', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return '12345678901234567';
                return null;
            });
            
            mockGuild.bans.fetch.mockResolvedValue({ user: bannedUser });
            
            await unbanCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.fetch).toHaveBeenCalledWith('12345678901234567');
        });

        it('should accept valid 18-digit user ID', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return '123456789012345678';
                return null;
            });
            
            mockGuild.bans.fetch.mockResolvedValue({ user: bannedUser });
            
            await unbanCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.fetch).toHaveBeenCalledWith('123456789012345678');
        });

        it('should accept valid 19-digit user ID', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return '1234567890123456789';
                return null;
            });
            
            mockGuild.bans.fetch.mockResolvedValue({ user: bannedUser });
            
            await unbanCommand.execute(mockInteraction);
            
            expect(mockGuild.bans.fetch).toHaveBeenCalledWith('1234567890123456789');
        });

        it('should reject user ID with 20 digits', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'user-id') return '12345678901234567890';
                return null;
            });
            
            await unbanCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid User ID');
        });
    });
});
