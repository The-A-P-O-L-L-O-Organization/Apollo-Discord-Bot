// Mute Command Tests
// Tests for the mute command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Guild, GuildMember, User } from 'discord.js';
import muteCommand from '../../src/plugins/moderation/commands/mute.js';
import {
    createMockInteraction,
    createMockUser,
    createMockMember,
    createMockGuild
} from '../mocks/discord.js';
import type { MockCommandInteraction, MockGuild, MockGuildMember, MockUser } from '../mocks/discord.js';
import { DiscordErrorCodes } from '../../src/utils/discordErrors.js';

// Mock the db module
vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn(),
    updateGuildData: vi.fn((store, guildId, updater) => {
        return Promise.resolve(updater({ nextCaseId: 1 }));
    }),
    getData: vi.fn(),
    setData: vi.fn(),
    getUserData: vi.fn(),
    setUserData: vi.fn()
}));

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined),
    fetchMember: vi.fn()
}));

import { sendModLog, fetchMember } from '../../src/utils/modLog.js';

describe('Mute Command', () => {
    let mockInteraction: MockCommandInteraction;
    let targetUser: MockUser;
    let targetMember: MockGuildMember;
    let mockGuild: MockGuild;

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
            member: createMockMember({ user: createMockUser({ id: '999888777' }) }),
            guild: mockGuild,
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockImplementation((name) => {
                    if (name === 'duration') {return '1h';}
                    if (name === 'reason') {return 'Spamming in chat';}
                    return null;
                })
            }
        }) as unknown as MockCommandInteraction;

        vi.mocked(fetchMember).mockResolvedValue(targetMember);
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
            
            const userOption = muteCommand.options.find((o: { name: string }) => o.name === 'user');
            expect(userOption!.required).toBe(true);
            
            const durationOption = muteCommand.options.find((o: { name: string }) => o.name === 'duration');
            expect(durationOption!.required).toBe(false);
            
            const reasonOption = muteCommand.options.find((o: { name: string }) => o.name === 'reason');
            expect(reasonOption!.required).toBe(false);
        });
    });

    describe('execute - Success Cases', () => {
        it('should mute user successfully with timeout', async() => {
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                3600000, // 1 hour in ms
                'Spamming in chat'
            );
        });

        it('should reply with success embed', async() => {
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toBe('[SUCCESS] User Muted');
        });

        it('should include correct mute details in response', async() => {
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            const embed = replyCall.embeds[0];
            
            expect(embed.description).toContain('TargetUser#0001');
            expect(embed.fields.some((f: { name: string; value: string }) => f.name.includes('Duration'))).toBe(true);
            expect(embed.fields.some((f: { name: string; value: string }) => f.name.includes('Reason'))).toBe(true);
        });

        it('should send mod log with duration', async() => {
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
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

        it('should use default 1 hour duration when none provided', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'reason') {return 'Test reason';}
                return null;
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                3600000, // Default 1 hour
                'Test reason'
            );
        });

        it('should use default reason when none provided', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return '30m';}
                return null;
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                1800000, // 30 minutes
                'No reason provided'
            );
        });
    });

    describe('execute - Duration Parsing', () => {
        it('should parse minutes correctly', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return '30m';}
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                1800000,
                expect.any(String)
            );
        });

        it('should parse hours correctly', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return '2h';}
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                7200000,
                expect.any(String)
            );
        });

        it('should parse days correctly', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return '1d';}
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                86400000,
                expect.any(String)
            );
        });

        it('should parse weeks correctly', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return '1w';}
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.timeout).toHaveBeenCalledWith(
                604800000,
                expect.any(String)
            );
        });

        it('should reject invalid duration format', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return 'invalid';}
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Invalid Duration');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject duration over 28 days', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'duration') {return '5w';}
                return 'Test';
            });
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Duration Too Long');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async() => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Missing User');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject self-mute', async() => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
        });

        it('should reject when member not found', async() => {
            vi.mocked(fetchMember).mockResolvedValue(null);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Member Not Found');
        });

        it('should reject when member is not moderatable', async() => {
            targetMember.moderatable = false;
            vi.mocked(fetchMember).mockResolvedValue(targetMember);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Cannot Mute');
        });

        it('should handle timeout API error gracefully', async() => {
            targetMember.timeout.mockRejectedValue(new Error('API Error'));
            // Also make roles.add fail so it doesn't fallback
            targetMember.roles.add.mockRejectedValue(new Error('Role API Error'));
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(new Error('Cannot create role'));
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
        });
    });

    describe('execute - Fallback to Mute Role', () => {
        it('should fallback to mute role when timeout fails', async() => {
            targetMember.timeout.mockRejectedValue(new Error('Timeout not supported'));
            
            // Set up existing mute role
            const muteRole = { id: 'mute-role-id', name: 'Muted' };
            mockGuild.roles = {
                cache: {
                    find: vi.fn().mockReturnValue(muteRole)
                }
            } as unknown as MockGuild['roles'];
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(targetMember.roles.add).toHaveBeenCalledWith(
                muteRole,
                expect.any(String)
            );
        });

        it('should create mute role if it does not exist', async() => {
            targetMember.timeout.mockRejectedValue(new Error('Timeout not supported'));
            
            mockGuild.roles = {
                cache: {
                    find: vi.fn().mockReturnValue(null)
                },
                create: vi.fn().mockResolvedValue({ id: 'new-mute-role', name: 'Muted' })
            } as unknown as MockGuild['roles'];
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockGuild.roles.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Muted',
                    permissions: []
                })
            );
        });
    });

    describe('hierarchy check', () => {
        it('should block muting a higher-ranked member', async() => {
            const lowMod = createMockMember({
                user: createMockUser({ id: 'lowmod' }),
                roles: { highest: { position: 2 } }
            });
            const highTarget = createMockMember({
                user: targetUser,
                moderatable: true,
                roles: { highest: { position: 5 } }
            });
            vi.mocked(fetchMember).mockResolvedValue(highTarget);
            mockInteraction.member = lowMod;

            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Hierarchy Check Failed');
            expect(highTarget.timeout).not.toHaveBeenCalled();
        });

        it('should allow muting a lower-ranked member', async() => {
            const highMod = createMockMember({
                user: createMockUser({ id: 'highmod' }),
                roles: { highest: { position: 5 } }
            });
            const lowTarget = createMockMember({
                user: targetUser,
                moderatable: true,
                roles: {
                    highest: { position: 2 },
                    cache: new Map()
                }
            });
            vi.mocked(fetchMember).mockResolvedValue(lowTarget);
            mockInteraction.member = highMod;

            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            expect(lowTarget.timeout).toHaveBeenCalledWith(
                3600000,
                'Spamming in chat'
            );
        });
    });

    describe('execute - Discord API Error Handling', () => {
        it('should handle 50013 Missing Permissions error with fallback error message', async() => {
            const error = new Error('Missing Permissions');
            (error as unknown as { code: unknown }).code = DiscordErrorCodes.MISSING_PERMISSIONS;
            targetMember.timeout.mockRejectedValue(error);
            targetMember.roles.add.mockRejectedValue(error);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(error);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Could not find or create a "Muted" role');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle 10062 Unknown Interaction error with fallback error message', async() => {
            const error = new Error('Unknown Interaction');
            (error as unknown as { code: unknown }).code = DiscordErrorCodes.UNKNOWN_INTERACTION;
            targetMember.timeout.mockRejectedValue(error);
            targetMember.roles.add.mockRejectedValue(error);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(error);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Could not find or create a "Muted" role');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle ECONNREFUSED network error with fallback error message', async() => {
            const error = new Error('connect ECONNREFUSED');
            (error as unknown as { code: unknown }).code = 'ECONNREFUSED';
            targetMember.timeout.mockRejectedValue(error);
            targetMember.roles.add.mockRejectedValue(error);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(error);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Could not find or create a "Muted" role');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle 50035 Invalid Form Body validation error with fallback error message', async() => {
            const error = new Error('Invalid Form Body');
            (error as unknown as { code: unknown }).code = DiscordErrorCodes.INVALID_FORM_BODY;
            (error as unknown as { errors: unknown }).errors = {
                'communication_disabled_until': {
                    _errors: [{ code: 'INVALID_VALUE', message: 'Invalid timestamp' }]
                }
            };
            targetMember.timeout.mockRejectedValue(error);
            targetMember.roles.add.mockRejectedValue(error);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(error);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Could not find or create a "Muted" role');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle 429 Rate Limited error with fallback error message', async() => {
            const error = new Error('Rate Limited');
            (error as unknown as { code: unknown }).code = DiscordErrorCodes.RATE_LIMITED;
            (error as unknown as { retryAfter: unknown }).retryAfter = 5000;
            targetMember.timeout.mockRejectedValue(error);
            targetMember.roles.add.mockRejectedValue(error);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.create.mockRejectedValue(error);
            
            await muteCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Could not find or create a "Muted" role');
            expect(replyCall.flags).toBe(64);
        });
    });
});
