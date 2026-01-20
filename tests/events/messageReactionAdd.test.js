// Message Reaction Add Event Tests
// Tests for the messageReactionAdd event handler (reaction roles)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageReactionAddEvent from '../../src/events/messageReactionAdd.js';
import { 
    createMockUser, 
    createMockGuild,
    createMockMessage,
    createMockMember,
    createMockClient
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn()
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        reactionRoles: {
            dmOnRole: false
        }
    }
}));

import { getGuildData } from '../../src/utils/dataStore.js';

describe('MessageReactionAdd Event', () => {
    let mockReaction;
    let mockUser;
    let mockGuild;
    let mockClient;
    let mockMember;
    let reactionRolesConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server',
            members: {
                fetch: vi.fn()
            },
            roles: {
                fetch: vi.fn().mockResolvedValue({ name: 'Cool Role' })
            }
        });
        
        const rolesCache = new Map();
        mockMember = createMockMember({
            id: '123456789',
            guild: mockGuild,
            roles: rolesCache
        });
        mockMember.roles = {
            cache: rolesCache,
            add: vi.fn().mockResolvedValue({}),
            has: vi.fn().mockReturnValue(false)
        };
        mockMember.roles.cache.has = vi.fn().mockReturnValue(false);
        
        mockGuild.members.fetch = vi.fn().mockResolvedValue(mockMember);
        
        mockUser = createMockUser({
            id: '123456789',
            tag: 'TestUser#0001',
            bot: false
        });
        
        const mockMessage = createMockMessage({
            id: '777888999',
            guild: mockGuild
        });
        
        mockReaction = {
            message: mockMessage,
            emoji: {
                id: null,
                name: '👍'
            },
            partial: false,
            fetch: vi.fn().mockResolvedValue({})
        };
        
        mockClient = createMockClient();
        
        reactionRolesConfig = {
            roles: [
                {
                    messageId: '777888999',
                    emoji: '👍',
                    roleId: 'role-123'
                }
            ]
        };
        
        getGuildData.mockReturnValue(reactionRolesConfig);
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(messageReactionAddEvent.name).toBe('messageReactionAdd');
        });

        it('should not be a once event', () => {
            expect(messageReactionAddEvent.once).toBe(false);
        });
    });

    describe('User Filtering', () => {
        it('should ignore bot reactions', async () => {
            mockUser.bot = true;
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });

    describe('Partial Reaction Handling', () => {
        it('should fetch partial reactions', async () => {
            mockReaction.partial = true;
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockReaction.fetch).toHaveBeenCalled();
        });

        it('should handle partial fetch error gracefully', async () => {
            mockReaction.partial = true;
            mockReaction.fetch.mockRejectedValue(new Error('Cannot fetch'));
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('DM Handling', () => {
        it('should ignore DM reactions', async () => {
            mockReaction.message.guild = null;
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });

    describe('Reaction Role Assignment', () => {
        it('should add role when user reacts with correct emoji', async () => {
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).toHaveBeenCalledWith('role-123', 'Reaction role');
        });

        it('should not add role if user already has it', async () => {
            mockMember.roles.cache.has = vi.fn().mockReturnValue(true);
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });

        it('should handle custom emoji reactions', async () => {
            mockReaction.emoji = {
                id: 'emoji-id-123',
                name: 'custom_emoji'
            };
            reactionRolesConfig.roles[0].emoji = 'custom_emoji:emoji-id-123';
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).toHaveBeenCalledWith('role-123', 'Reaction role');
        });

        it('should not add role for non-matching message', async () => {
            reactionRolesConfig.roles[0].messageId = 'different-message-id';
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });

        it('should not add role for non-matching emoji', async () => {
            mockReaction.emoji.name = '👎';
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('No Reaction Roles Configured', () => {
        it('should handle empty roles array', async () => {
            reactionRolesConfig.roles = [];
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });

        it('should handle missing roles property', async () => {
            getGuildData.mockReturnValue({});
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('Member Fetch Errors', () => {
        it('should handle member fetch error', async () => {
            mockGuild.members.fetch.mockRejectedValue(new Error('Member not found'));
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('Role Add Errors', () => {
        it('should handle role add error gracefully', async () => {
            mockMember.roles.add.mockRejectedValue(new Error('Missing permissions'));
            
            await expect(
                messageReactionAddEvent.execute(mockReaction, mockUser, mockClient)
            ).resolves.not.toThrow();
        });
    });

    describe('Multiple Reaction Roles', () => {
        it('should find correct role from multiple configured roles', async () => {
            reactionRolesConfig.roles = [
                { messageId: '111', emoji: '❤️', roleId: 'role-1' },
                { messageId: '777888999', emoji: '👍', roleId: 'role-123' },
                { messageId: '222', emoji: '⭐', roleId: 'role-2' }
            ];
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await messageReactionAddEvent.execute(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).toHaveBeenCalledWith('role-123', 'Reaction role');
        });
    });
});
