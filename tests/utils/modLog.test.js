// Mod Log Utility Tests
// Tests for the moderation logging functions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendModLog, fetchMember } from '../../src/utils/modLog.js';
import { 
    createMockUser, 
    createMockGuild,
    createMockChannel,
    createMockMember
} from '../mocks/discord.js';

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        moderation: {
            logModerationActions: true,
            moderationLogChannel: 'mod-logs',
            defaultReason: 'No reason provided'
        }
    }
}));

import { config } from '../../src/config/config.js';

describe('ModLog Utility', () => {
    describe('sendModLog', () => {
        let mockGuild;
        let logChannel;
        let targetUser;
        let moderatorUser;

        beforeEach(() => {
            vi.clearAllMocks();
            
            logChannel = createMockChannel({
                id: '111222333',
                name: 'mod-logs',
                send: vi.fn().mockResolvedValue({})
            });
            
            const channelsCache = new Map();
            channelsCache.set('111222333', logChannel);
            
            mockGuild = createMockGuild({
                id: '987654321',
                name: 'Test Server'
            });
            
            // Override channels.cache.find to return log channel
            mockGuild.channels.cache.find = vi.fn().mockImplementation(fn => {
                if (fn(logChannel)) return logChannel;
                return null;
            });
            
            targetUser = createMockUser({ 
                id: '111222333', 
                tag: 'TargetUser#0001' 
            });
            
            moderatorUser = createMockUser({ 
                id: '444555666', 
                tag: 'Moderator#0001' 
            });
        });

        describe('Success Cases', () => {
            it('should send log embed for kick action', async () => {
                await sendModLog(mockGuild, {
                    action: 'kick',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Breaking rules'
                });
                
                expect(logChannel.send).toHaveBeenCalled();
                const sendCall = logChannel.send.mock.calls[0][0];
                expect(sendCall.embeds[0].title).toBe('[MODERATION] KICK');
            });

            it('should send log embed for ban action', async () => {
                await sendModLog(mockGuild, {
                    action: 'ban',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Severe violation'
                });
                
                expect(logChannel.send).toHaveBeenCalled();
                const sendCall = logChannel.send.mock.calls[0][0];
                expect(sendCall.embeds[0].title).toBe('[MODERATION] BAN');
            });

            it('should send log embed for mute action with duration', async () => {
                await sendModLog(mockGuild, {
                    action: 'mute',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Spamming',
                    duration: '1 hour'
                });
                
                expect(logChannel.send).toHaveBeenCalled();
                const sendCall = logChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                expect(embed.fields.some(f => f.name === 'Duration' && f.value === '1 hour')).toBe(true);
            });

            it('should include target user information', async () => {
                await sendModLog(mockGuild, {
                    action: 'warn',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Warning'
                });
                
                const sendCall = logChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                const targetField = embed.fields.find(f => f.name === 'Target User');
                expect(targetField.value).toContain('TargetUser#0001');
                expect(targetField.value).toContain('111222333');
            });

            it('should include moderator information', async () => {
                await sendModLog(mockGuild, {
                    action: 'warn',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Warning'
                });
                
                const sendCall = logChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                const modField = embed.fields.find(f => f.name === 'Moderator');
                expect(modField.value).toContain('Moderator#0001');
            });

            it('should include reason in embed', async () => {
                await sendModLog(mockGuild, {
                    action: 'kick',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Custom reason here'
                });
                
                const sendCall = logChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                const reasonField = embed.fields.find(f => f.name === 'Reason');
                expect(reasonField.value).toBe('Custom reason here');
            });

            it('should use default reason when none provided', async () => {
                await sendModLog(mockGuild, {
                    action: 'kick',
                    target: targetUser,
                    moderator: moderatorUser
                });
                
                const sendCall = logChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                const reasonField = embed.fields.find(f => f.name === 'Reason');
                expect(reasonField.value).toBe('No reason provided');
            });

            it('should add extra fields when provided', async () => {
                await sendModLog(mockGuild, {
                    action: 'purge',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Cleaning up',
                    extra: {
                        'Messages Deleted': '50',
                        'Channel': '#general'
                    }
                });
                
                const sendCall = logChannel.send.mock.calls[0][0];
                const embed = sendCall.embeds[0];
                expect(embed.fields.some(f => f.name === 'Messages Deleted')).toBe(true);
                expect(embed.fields.some(f => f.name === 'Channel')).toBe(true);
            });

            it('should use correct color for each action type', async () => {
                const actions = [
                    { action: 'kick', expectedColor: 0xFFA500 },
                    { action: 'ban', expectedColor: 0xFF0000 },
                    { action: 'unban', expectedColor: 0x00FF00 },
                    { action: 'mute', expectedColor: 0xFFFF00 },
                    { action: 'unmute', expectedColor: 0x00FF00 }
                ];

                for (const { action, expectedColor } of actions) {
                    vi.clearAllMocks();
                    await sendModLog(mockGuild, {
                        action,
                        target: targetUser,
                        moderator: moderatorUser,
                        reason: 'Test'
                    });
                    
                    const sendCall = logChannel.send.mock.calls[0][0];
                    expect(sendCall.embeds[0].color).toBe(expectedColor);
                }
            });
        });

        describe('Disabled Logging', () => {
            it('should not send log when logging is disabled', async () => {
                // Temporarily override config
                const originalValue = config.moderation.logModerationActions;
                config.moderation.logModerationActions = false;
                
                await sendModLog(mockGuild, {
                    action: 'kick',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Test'
                });
                
                expect(logChannel.send).not.toHaveBeenCalled();
                
                // Restore config
                config.moderation.logModerationActions = originalValue;
            });
        });

        describe('Missing Channel', () => {
            it('should handle missing log channel gracefully', async () => {
                mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
                
                await expect(sendModLog(mockGuild, {
                    action: 'kick',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Test'
                })).resolves.not.toThrow();
                
                expect(logChannel.send).not.toHaveBeenCalled();
            });
        });

        describe('Error Handling', () => {
            it('should handle send errors gracefully', async () => {
                logChannel.send.mockRejectedValue(new Error('Permission denied'));
                
                await expect(sendModLog(mockGuild, {
                    action: 'kick',
                    target: targetUser,
                    moderator: moderatorUser,
                    reason: 'Test'
                })).resolves.not.toThrow();
            });
        });
    });

    describe('fetchMember', () => {
        let mockGuild;

        beforeEach(() => {
            vi.clearAllMocks();
            
            mockGuild = createMockGuild({
                id: '987654321',
                name: 'Test Server'
            });
        });

        it('should return member from cache', async () => {
            const cachedMember = createMockMember({
                id: '123456789',
                user: createMockUser({ id: '123456789', tag: 'CachedUser#0001' })
            });
            
            mockGuild.members.cache.get = vi.fn().mockReturnValue(cachedMember);
            
            const result = await fetchMember(mockGuild, '123456789');
            
            expect(result).toBe(cachedMember);
            expect(mockGuild.members.fetch).not.toHaveBeenCalled();
        });

        it('should fetch member from API when not in cache', async () => {
            const fetchedMember = createMockMember({
                id: '123456789',
                user: createMockUser({ id: '123456789', tag: 'FetchedUser#0001' })
            });
            
            mockGuild.members.cache.get = vi.fn().mockReturnValue(undefined);
            mockGuild.members.fetch = vi.fn().mockResolvedValue(fetchedMember);
            
            const result = await fetchMember(mockGuild, '123456789');
            
            expect(result).toBe(fetchedMember);
            expect(mockGuild.members.fetch).toHaveBeenCalledWith('123456789');
        });

        it('should return null when member not found', async () => {
            mockGuild.members.cache.get = vi.fn().mockReturnValue(undefined);
            mockGuild.members.fetch = vi.fn().mockRejectedValue(new Error('Unknown Member'));
            
            const result = await fetchMember(mockGuild, '999999999');
            
            expect(result).toBeNull();
        });

        it('should handle fetch errors gracefully', async () => {
            mockGuild.members.cache.get = vi.fn().mockReturnValue(undefined);
            mockGuild.members.fetch = vi.fn().mockRejectedValue(new Error('API Error'));
            
            await expect(fetchMember(mockGuild, '123456789')).resolves.not.toThrow();
            
            const result = await fetchMember(mockGuild, '123456789');
            expect(result).toBeNull();
        });
    });
});
