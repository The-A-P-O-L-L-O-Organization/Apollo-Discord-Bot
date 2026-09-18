// Message Reaction Remove Event Tests
// Tests for the messageReactionRemove event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, Guild, GuildMember, Message } from 'discord.js';
import messageReactionRemoveEvent from '../../src/plugins/admin/events/messageReactionRemove.js';
import {
    createMockUser,
    createMockGuild,
    createMockMessage,
    createMockMember
} from '../mocks/discord.js';
import type { MockMemberOptions, MockMessageOptions } from '../mocks/discord.js';

// Mock the db module
vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn().mockReturnValue({ roles: [] })
}));

import * as mockedDb from '../../src/utils/db.js';

const { getGuildData } = mockedDb as unknown as {
    getGuildData: ReturnType<typeof vi.fn>;
};

interface MockReaction {
    message: Message;
    emoji: { id: string | null; name: string };
    partial: boolean;
    fetch: ReturnType<typeof vi.fn>;
}

const executeReactionRemove = messageReactionRemoveEvent.execute as (
    reaction: MockReaction,
    user: User,
    client: unknown
) => Promise<void>;

describe('MessageReactionRemove Event', () => {
    let mockReaction: MockReaction;
    let mockUser: User;
    let mockGuild: Guild;
    let mockMember: GuildMember;
    let mockClient: unknown;
    let rolesRemoveMock: ReturnType<typeof vi.fn>;
    let rolesHasMock: ReturnType<typeof vi.fn>;
    let memberFetchMock: ReturnType<typeof vi.fn>;
    let reactionFetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockMember = createMockMember({
            id: '123456789',
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }) as unknown as MockMemberOptions['user'],
            guild: mockGuild as unknown as MockMemberOptions['guild']
        });
        rolesRemoveMock = vi.fn().mockResolvedValue({});
        rolesHasMock = vi.fn().mockReturnValue(true);
        (mockMember.roles as unknown as { remove: unknown }).remove = rolesRemoveMock;
        (mockMember.roles as unknown as { cache: { has: unknown } }).cache.has = rolesHasMock;

        memberFetchMock = vi.fn().mockResolvedValue(mockMember);
        (mockGuild.members as unknown as { fetch: unknown }).fetch = memberFetchMock;

        mockUser = createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false });

        reactionFetchMock = vi.fn().mockResolvedValue({});
        mockReaction = {
            emoji: { name: '1', id: null },
            message: createMockMessage({
                id: '777888999',
                guild: mockGuild as unknown as MockMessageOptions['guild']
            }) as unknown as Message,
            partial: false,
            fetch: reactionFetchMock
        };
        
        mockClient = {};
        
        getGuildData.mockReturnValue({ roles: [] });
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(messageReactionRemoveEvent.name).toBe('messageReactionRemove');
        });

        it('should not be a once event', () => {
            expect(messageReactionRemoveEvent.once).toBe(false);
        });
    });

    describe('Filtering', () => {
        it('should ignore bot reactions', async() => {
            mockUser.bot = true;
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });

        it('should ignore DM reactions', async() => {
            (mockReaction.message as unknown as { guild: Guild | null }).guild = null;
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });

        it('should handle partial reactions', async() => {
            mockReaction.partial = true;
            mockReaction.fetch = vi.fn().mockResolvedValue(mockReaction);
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockReaction.fetch).toHaveBeenCalled();
        });

        it('should return early if partial reaction fetch fails', async() => {
            mockReaction.partial = true;
            mockReaction.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });

    describe('Reaction Role Removal', () => {
        const reactionRoleConfig = {
            roles: [
                {
                    messageId: '777888999',
                    emoji: '1',
                    roleId: 'role-123'
                }
            ]
        };

        it('should remove role when reaction role is configured', async() => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalledWith('role-123', 'Reaction role removed');
        });

        it('should not remove role when message is not a reaction role message', async() => {
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: 'different-message-id',
                        emoji: '1',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should not remove role when emoji does not match', async() => {
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: '777888999',
                        emoji: '2',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should handle custom emoji identifiers', async() => {
            mockReaction.emoji = { name: 'custom', id: '999888777' };
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: '777888999',
                        emoji: 'custom:999888777',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalledWith('role-123', 'Reaction role removed');
        });

        it('should not remove role if member does not have it', async() => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            rolesHasMock.mockReturnValue(false);
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should do nothing when no reaction roles are configured', async() => {
            getGuildData.mockReturnValue({ roles: [] });
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should do nothing when roles config is undefined', async() => {
            getGuildData.mockReturnValue({});
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        const reactionRoleConfig = {
            roles: [
                {
                    messageId: '777888999',
                    emoji: '1',
                    roleId: 'role-123'
                }
            ]
        };

        it('should handle member fetch errors gracefully', async() => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            memberFetchMock.mockRejectedValue(new Error('Member not found'));
            
            await expect(
                executeReactionRemove(mockReaction, mockUser, mockClient)
            ).resolves.not.toThrow();
        });

        it('should handle role remove errors gracefully', async() => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            rolesRemoveMock.mockRejectedValue(new Error('Missing permissions'));
            
            await expect(
                executeReactionRemove(mockReaction, mockUser, mockClient)
            ).resolves.not.toThrow();
        });
    });

    describe('Emoji Matching', () => {
        it('should match by emoji name', async() => {
            mockReaction.emoji = { name: 'thumbsup', id: null };
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: '777888999',
                        emoji: 'thumbsup',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalled();
        });

        it('should match by emoji ID', async() => {
            mockReaction.emoji = { name: 'custom', id: '999888777' };
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: '777888999',
                        emoji: '999888777',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await executeReactionRemove(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalled();
        });
    });
});
