// Reaction Role Command Tests
// Tests for the reaction role command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import reactionRoleCommand from '../../src/commands/reactionrole.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockGuild,
    createMockChannel,
    createMockMessage
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn()
}));

import { getGuildData, setGuildData } from '../../src/utils/dataStore.js';

describe('ReactionRole Command', () => {
    let mockInteraction;
    let mockGuild;
    let mockChannel;
    let mockMessage;
    let mockRole;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockMessage = createMockMessage({ id: '777888999' });
        mockMessage.react = vi.fn().mockResolvedValue({});
        mockMessage.url = 'https://discord.com/channels/987654321/111222333/777888999';
        mockMessage.reactions = {
            cache: new Map()
        };
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'test-channel'
        });
        mockChannel.messages = {
            fetch: vi.fn().mockResolvedValue(mockMessage)
        };
        
        mockRole = {
            id: '444555666',
            name: 'Test Role',
            position: 5
        };
        
        mockGuild = createMockGuild({ id: '987654321' });
        mockGuild.members = {
            me: {
                roles: {
                    highest: { position: 10 }
                }
            }
        };
        mockGuild.channels = {
            fetch: vi.fn().mockResolvedValue(mockChannel)
        };
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'Admin#0001' }),
            guild: mockGuild,
            channel: mockChannel,
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn(),
                getRole: vi.fn().mockReturnValue(mockRole),
                getChannel: vi.fn().mockReturnValue(null)
            }
        });

        getGuildData.mockReturnValue({ roles: [] });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(reactionRoleCommand.data.name).toBe('reactionrole');
        });

        it('should have a description', () => {
            expect(reactionRoleCommand.data.description).toBeTruthy();
        });

        it('should be in admin category', () => {
            expect(reactionRoleCommand.category).toBe('admin');
        });
    });

    describe('execute - add subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('add');
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'message_id') return '777888999';
                if (name === 'emoji') return '👍';
                return null;
            });
        });

        it('should add reaction role successfully', async () => {
            await reactionRoleCommand.execute(mockInteraction);
            
            expect(mockMessage.react).toHaveBeenCalledWith('👍');
            expect(setGuildData).toHaveBeenCalled();
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].roles).toHaveLength(1);
            expect(setCall[2].roles[0].roleId).toBe(mockRole.id);
        });

        it('should reply with success message', async () => {
            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Reaction role added');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should use specified channel', async () => {
            const otherChannel = createMockChannel({ id: '999888777' });
            otherChannel.messages = {
                fetch: vi.fn().mockResolvedValue(mockMessage)
            };
            mockInteraction.options.getChannel.mockReturnValue(otherChannel);

            await reactionRoleCommand.execute(mockInteraction);
            
            expect(otherChannel.messages.fetch).toHaveBeenCalledWith('777888999');
        });

        it('should reject role higher than bot', async () => {
            mockRole.position = 15; // Higher than bot's highest (10)

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('higher than');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject @everyone role', async () => {
            mockRole.id = '987654321'; // Same as guild ID

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('@everyone');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle message not found', async () => {
            mockChannel.messages.fetch.mockRejectedValue(new Error('Not found'));

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Could not find');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle invalid emoji', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'message_id') return '777888999';
                if (name === 'emoji') return '';
                return null;
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid emoji');
        });

        it('should update existing reaction role', async () => {
            getGuildData.mockReturnValue({
                roles: [{
                    messageId: '777888999',
                    emoji: '👍',
                    roleId: '111111111'
                }]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].roles).toHaveLength(1);
            expect(setCall[2].roles[0].roleId).toBe(mockRole.id);
        });
    });

    describe('execute - remove subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('remove');
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'message_id') return '777888999';
                if (name === 'emoji') return '👍';
                return null;
            });
        });

        it('should remove reaction role successfully', async () => {
            getGuildData.mockReturnValue({
                roles: [{
                    messageId: '777888999',
                    channelId: '111222333',
                    emoji: '👍',
                    roleId: '444555666'
                }]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].roles).toHaveLength(0);
        });

        it('should handle no reaction roles configured', async () => {
            getGuildData.mockReturnValue({ roles: [] });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('No reaction roles');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle reaction role not found', async () => {
            getGuildData.mockReturnValue({
                roles: [{
                    messageId: '999999999', // Different message
                    emoji: '👍',
                    roleId: '444555666'
                }]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('No reaction role found');
        });
    });

    describe('execute - list subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('list');
        });

        it('should list all reaction roles', async () => {
            getGuildData.mockReturnValue({
                roles: [
                    { messageId: '111', channelId: '222', emoji: '👍', emojiDisplay: '👍', roleId: '333' },
                    { messageId: '111', channelId: '222', emoji: '👎', emojiDisplay: '👎', roleId: '444' }
                ]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('Reaction Roles');
            expect(replyCall.embeds[0].description).toContain('2');
        });

        it('should handle no reaction roles', async () => {
            getGuildData.mockReturnValue({ roles: [] });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('No reaction roles');
        });
    });

    describe('execute - clear subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('clear');
            mockInteraction.options.getString.mockReturnValue('777888999');
        });

        it('should clear all reaction roles from message', async () => {
            getGuildData.mockReturnValue({
                roles: [
                    { messageId: '777888999', channelId: '111222333', emoji: '👍', roleId: '333' },
                    { messageId: '777888999', channelId: '111222333', emoji: '👎', roleId: '444' },
                    { messageId: '999999999', channelId: '111222333', emoji: '🎉', roleId: '555' }
                ]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].roles).toHaveLength(1);
            expect(setCall[2].roles[0].messageId).toBe('999999999');
        });

        it('should reply with count of cleared roles', async () => {
            getGuildData.mockReturnValue({
                roles: [
                    { messageId: '777888999', channelId: '111222333', emoji: '👍', roleId: '333' },
                    { messageId: '777888999', channelId: '111222333', emoji: '👎', roleId: '444' }
                ]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('2');
        });

        it('should handle no reaction roles on message', async () => {
            getGuildData.mockReturnValue({
                roles: [
                    { messageId: '999999999', emoji: '👍', roleId: '333' }
                ]
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('No reaction roles found');
        });
    });

    describe('execute - Custom Emoji Parsing', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('add');
        });

        it('should handle custom emoji format', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'message_id') return '777888999';
                if (name === 'emoji') return '<:custom:123456789>';
                return null;
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            expect(mockMessage.react).toHaveBeenCalledWith('123456789');
        });

        it('should handle animated emoji format', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'message_id') return '777888999';
                if (name === 'emoji') return '<a:animated:987654321>';
                return null;
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            expect(mockMessage.react).toHaveBeenCalledWith('987654321');
        });

        it('should handle emoji ID only', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'message_id') return '777888999';
                if (name === 'emoji') return '123456789012345678';
                return null;
            });

            await reactionRoleCommand.execute(mockInteraction);
            
            expect(mockMessage.react).toHaveBeenCalled();
        });
    });
});
