// Message Reaction Remove Event Tests
// Tests for the messageReactionRemove event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageReactionRemoveEvent from '../../src/events/messageReactionRemove.js';
import { 
    createMockUser, 
    createMockGuild,
    createMockMessage,
    createMockMember
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn().mockReturnValue({ roles: [] })
}));

import { getGuildData } from '../../src/utils/dataStore.js';

describe('MessageReactionRemove Event', () => {
    let mockReaction;
    let mockUser;
    let mockGuild;
    let mockMember;
    let mockClient;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockMember = createMockMember({
            id: '123456789',
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }),
            guild: mockGuild
        });
        mockMember.roles.remove = vi.fn().mockResolvedValue({});
        mockMember.roles.cache.has = vi.fn().mockReturnValue(true);
        
        mockGuild.members.fetch = vi.fn().mockResolvedValue(mockMember);
        
        mockUser = createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false });
        
        mockReaction = {
            emoji: { name: '1', id: null },
            message: createMockMessage({
                id: '777888999',
                guild: mockGuild
            }),
            partial: false,
            fetch: vi.fn().mockResolvedValue({})
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
        it('should ignore bot reactions', async () => {
            mockUser.bot = true;
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });

        it('should ignore DM reactions', async () => {
            mockReaction.message.guild = null;
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });

        it('should handle partial reactions', async () => {
            mockReaction.partial = true;
            mockReaction.fetch = vi.fn().mockResolvedValue(mockReaction);
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockReaction.fetch).toHaveBeenCalled();
        });

        it('should return early if partial reaction fetch fails', async () => {
            mockReaction.partial = true;
            mockReaction.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
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

        it('should remove role when reaction role is configured', async () => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalledWith('role-123', 'Reaction role removed');
        });

        it('should not remove role when message is not a reaction role message', async () => {
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: 'different-message-id',
                        emoji: '1',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should not remove role when emoji does not match', async () => {
            getGuildData.mockReturnValue({
                roles: [
                    {
                        messageId: '777888999',
                        emoji: '2',
                        roleId: 'role-123'
                    }
                ]
            });
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should handle custom emoji identifiers', async () => {
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
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalledWith('role-123', 'Reaction role removed');
        });

        it('should not remove role if member does not have it', async () => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            mockMember.roles.cache.has = vi.fn().mockReturnValue(false);
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should do nothing when no reaction roles are configured', async () => {
            getGuildData.mockReturnValue({ roles: [] });
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).not.toHaveBeenCalled();
        });

        it('should do nothing when roles config is undefined', async () => {
            getGuildData.mockReturnValue({});
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
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

        it('should handle member fetch errors gracefully', async () => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            mockGuild.members.fetch = vi.fn().mockRejectedValue(new Error('Member not found'));
            
            await expect(
                messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient)
            ).resolves.not.toThrow();
        });

        it('should handle role remove errors gracefully', async () => {
            getGuildData.mockReturnValue(reactionRoleConfig);
            mockMember.roles.remove = vi.fn().mockRejectedValue(new Error('Missing permissions'));
            
            await expect(
                messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient)
            ).resolves.not.toThrow();
        });
    });

    describe('Emoji Matching', () => {
        it('should match by emoji name', async () => {
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
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalled();
        });

        it('should match by emoji ID', async () => {
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
            
            await messageReactionRemoveEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.remove).toHaveBeenCalled();
        });
    });
});
