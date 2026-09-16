// Message Reaction Add Event Tests
// Tests for the messageReactionAdd event handler (reaction roles)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, Guild, GuildMember, Message, Client } from 'discord.js';
import messageReactionAddEvent from '../../src/plugins/admin/events/messageReactionAdd.js';
import {
    createMockUser,
    createMockGuild,
    createMockMessage,
    createMockMember,
    createMockClient
} from '../mocks/discord.js';
import type { MockMemberOptions, MockMessageOptions } from '../mocks/discord.js';

// Mock the db module
vi.mock('../../src/utils/db.js', () => ({
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

interface ReactionRoleEntry {
    messageId: string;
    emoji: string;
    roleId: string;
}

const executeReactionAdd = messageReactionAddEvent.execute as (
    reaction: MockReaction,
    user: User,
    client: Client
) => Promise<void>;

describe('MessageReactionAdd Event', () => {
    let mockReaction: MockReaction;
    let mockUser: User;
    let mockGuild: Guild;
    let mockClient: Client;
    let mockMember: GuildMember;
    let reactionRolesConfig: { roles: ReactionRoleEntry[] };
    let rolesAddMock: ReturnType<typeof vi.fn>;
    let rolesHasMock: ReturnType<typeof vi.fn>;
    let memberFetchMock: ReturnType<typeof vi.fn>;
    let reactionFetchMock: ReturnType<typeof vi.fn>;

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
            guild: mockGuild as unknown as MockMemberOptions['guild'],
            roles: rolesCache as unknown as MockMemberOptions['roles']
        });
        rolesAddMock = vi.fn().mockResolvedValue({});
        rolesHasMock = vi.fn().mockReturnValue(false);
        (mockMember as unknown as { roles: unknown }).roles = {
            cache: { has: rolesHasMock },
            add: rolesAddMock,
            has: rolesHasMock
        } as unknown as GuildMember['roles'];

        memberFetchMock = vi.fn().mockResolvedValue(mockMember);
        (mockGuild.members as unknown as { fetch: unknown }).fetch = memberFetchMock;
        
        mockUser = createMockUser({
            id: '123456789',
            tag: 'TestUser#0001',
            bot: false
        });
        
        const mockMessage = createMockMessage({
            id: '777888999',
            guild: mockGuild as unknown as MockMessageOptions['guild']
        });

        reactionFetchMock = vi.fn().mockResolvedValue({});
        mockReaction = {
            message: mockMessage,
            emoji: {
                id: null,
                name: '👍'
            },
            partial: false,
            fetch: reactionFetchMock
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
        it('should ignore bot reactions', async() => {
            mockUser.bot = true;
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });

    describe('Partial Reaction Handling', () => {
        it('should fetch partial reactions', async() => {
            mockReaction.partial = true;
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockReaction.fetch).toHaveBeenCalled();
        });

        it('should handle partial fetch error gracefully', async() => {
            mockReaction.partial = true;
            mockReaction.fetch.mockRejectedValue(new Error('Cannot fetch'));
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('DM Handling', () => {
        it('should ignore DM reactions', async() => {
            (mockReaction.message as unknown as { guild: Guild | null }).guild = null;
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });

    describe('Reaction Role Assignment', () => {
        it('should add role when user reacts with correct emoji', async() => {
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).toHaveBeenCalledWith('role-123', 'Reaction role');
        });

        it('should not add role if user already has it', async() => {
            rolesHasMock.mockReturnValue(true);
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });

        it('should handle custom emoji reactions', async() => {
            mockReaction.emoji = {
                id: 'emoji-id-123',
                name: 'custom_emoji'
            };
            reactionRolesConfig.roles[0]!.emoji = 'custom_emoji:emoji-id-123';
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).toHaveBeenCalledWith('role-123', 'Reaction role');
        });

        it('should not add role for non-matching message', async() => {
            reactionRolesConfig.roles[0]!.messageId = 'different-message-id';
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });

        it('should not add role for non-matching emoji', async() => {
            mockReaction.emoji.name = '👎';
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('No Reaction Roles Configured', () => {
        it('should handle empty roles array', async() => {
            reactionRolesConfig.roles = [];
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });

        it('should handle missing roles property', async() => {
            getGuildData.mockReturnValue({});
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('Member Fetch Errors', () => {
        it('should handle member fetch error', async() => {
            memberFetchMock.mockRejectedValue(new Error('Member not found'));
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).not.toHaveBeenCalled();
        });
    });

    describe('Role Add Errors', () => {
        it('should handle role add error gracefully', async() => {
            rolesAddMock.mockRejectedValue(new Error('Missing permissions'));
            
            await expect(
                executeReactionAdd(mockReaction, mockUser, mockClient)
            ).resolves.not.toThrow();
        });
    });

    describe('Multiple Reaction Roles', () => {
        it('should find correct role from multiple configured roles', async() => {
            reactionRolesConfig.roles = [
                { messageId: '111', emoji: '❤️', roleId: 'role-1' },
                { messageId: '777888999', emoji: '👍', roleId: 'role-123' },
                { messageId: '222', emoji: '⭐', roleId: 'role-2' }
            ];
            getGuildData.mockReturnValue(reactionRolesConfig);
            
            await executeReactionAdd(mockReaction, mockUser, mockClient);
            
            expect(mockMember.roles.add).toHaveBeenCalledWith('role-123', 'Reaction role');
        });
    });
});
