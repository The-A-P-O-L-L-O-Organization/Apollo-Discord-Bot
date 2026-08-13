// Strike Command Tests
// Tests for the strike command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import strikeCommand from '../../src/plugins/moderation/commands/strike.js';
import {
    createMockInteraction,
    createMockUser,
    createMockMember,
    createMockGuild
} from '../mocks/discord.js';

// Mock the dependencies
vi.mock('../../src/utils/db.js', () => ({
    getUserData: vi.fn(),
    appendToUserArray: vi.fn(),
    generateId: vi.fn().mockReturnValue('test-strike-id'),
    getGuildData: vi.fn().mockReturnValue({})
}));

vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined),
    fetchMember: vi.fn()
}));

import { getUserData, appendToUserArray, getGuildData } from '../../src/utils/db.js';
import { sendModLog, fetchMember } from '../../src/utils/modLog.js';

describe('Strike Command', () => {
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
            member: createMockMember({ user: createMockUser({ id: '999888777' }) }),
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
            expect(strikeCommand.name).toBe('strike');
        });

        it('should have a description', () => {
            expect(strikeCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(strikeCommand.category).toBe('Moderation');
        });

        it('should require ModerateMembers permission', () => {
            expect(strikeCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should have required user and reason options', () => {
            const userOption = strikeCommand.options.find(o => o.name === 'user');
            const reasonOption = strikeCommand.options.find(o => o.name === 'reason');
            
            expect(userOption.required).toBe(true);
            expect(reasonOption.required).toBe(true);
        });
    });

    describe('execute - Success Cases', () => {
        it('should strike user successfully', async() => {
            await strikeCommand.execute(mockInteraction);
            
            expect(appendToUserArray).toHaveBeenCalledWith(
                'strikes',
                mockGuild.id,
                targetUser.id,
                expect.objectContaining({
                    id: 'test-strike-id',
                    reason: 'Breaking server rules',
                    moderatorId: '999888777',
                    active: true
                })
            );
        });

        it('should reply with success embed', async() => {
            await strikeCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('[SUCCESS] Strike Issued');
        });

        it('should send mod log', async() => {
            await strikeCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'strike',
                    target: targetUser,
                    moderator: mockInteraction.user,
                    reason: 'Breaking server rules'
                })
            );
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async() => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await strikeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject striking bots', async() => {
            targetUser.bot = true;
            mockInteraction.options.getUser.mockReturnValue(targetUser);
            
            await strikeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Target');
        });

        it('should reject self-strike', async() => {
            const sameUser = createMockUser({ id: '999888777' });
            mockInteraction.options.getUser.mockReturnValue(sameUser);
            
            await strikeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Self Action');
        });

        it('should reject when member not found', async() => {
            fetchMember.mockResolvedValue(null);
            
            await strikeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Member Not Found');
        });
    });

    describe('hierarchy check', () => {
        it('should block striking a higher-ranked member', async() => {
            const lowMod = createMockMember({
                user: createMockUser({ id: 'lowmod' }),
                roles: { highest: { position: 2 } }
            });
            const highTarget = createMockMember({
                user: targetUser,
                roles: { highest: { position: 5 } }
            });
            fetchMember.mockResolvedValue(highTarget);
            mockInteraction.member = lowMod;

            await strikeCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Hierarchy Check Failed');
            expect(appendToUserArray).not.toHaveBeenCalled();
        });

        it('should allow striking a lower-ranked member', async() => {
            const highMod = createMockMember({
                user: createMockUser({ id: 'highmod' }),
                roles: { highest: { position: 5 } }
            });
            const lowTarget = createMockMember({
                user: targetUser,
                roles: { highest: { position: 2 } }
            });
            fetchMember.mockResolvedValue(lowTarget);
            mockInteraction.member = highMod;

            await strikeCommand.execute(mockInteraction);

            expect(appendToUserArray).toHaveBeenCalledWith(
                'strikes',
                mockGuild.id,
                targetUser.id,
                expect.objectContaining({
                    id: 'test-strike-id',
                    reason: 'Breaking server rules',
                    moderatorId: '999888777',
                    active: true
                })
            );
        });
    });
});
