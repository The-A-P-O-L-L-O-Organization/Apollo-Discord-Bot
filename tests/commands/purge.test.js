// Purge Command Tests
// Tests for the purge command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import purgeCommand from '../../src/commands/purge.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockGuild,
    createMockChannel,
    createMockClient
} from '../mocks/discord.js';
import { PermissionsBitField } from 'discord.js';

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined)
}));

import { sendModLog } from '../../src/utils/modLog.js';

describe('Purge Command', () => {
    let mockInteraction;
    let mockChannel;
    let mockGuild;
    let mockClient;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock messages
        const mockMessages = new Map();
        for (let i = 0; i < 10; i++) {
            mockMessages.set(`msg-${i}`, {
                id: `msg-${i}`,
                author: { id: '123456789', tag: 'User#0001' },
                content: `Message ${i}`
            });
        }
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'test-channel'
        });
        mockChannel.messages = {
            fetch: vi.fn().mockResolvedValue(mockMessages)
        };
        mockChannel.bulkDelete = vi.fn().mockResolvedValue(mockMessages);
        mockChannel.permissionsFor = vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true)
        });
        
        mockGuild = createMockGuild({ id: '987654321' });
        mockClient = createMockClient();
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            channel: mockChannel,
            client: mockClient,
            options: {
                getInteger: vi.fn().mockReturnValue(10),
                getUser: vi.fn().mockReturnValue(null),
                getString: vi.fn().mockReturnValue(null)
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(purgeCommand.name).toBe('purge');
        });

        it('should have a description', () => {
            expect(purgeCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(purgeCommand.category).toBe('Moderation');
        });

        it('should require ManageMessages permission', () => {
            expect(purgeCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(purgeCommand.dmPermission).toBe(false);
        });

        it('should have correct option constraints', () => {
            const amountOption = purgeCommand.options.find(o => o.name === 'amount');
            expect(amountOption.min_value).toBe(1);
            expect(amountOption.max_value).toBe(100);
        });
    });

    describe('execute - Success Cases', () => {
        it('should delete messages successfully', async () => {
            await purgeCommand.execute(mockInteraction);
            
            expect(mockChannel.messages.fetch).toHaveBeenCalledWith({ limit: 10 });
            expect(mockChannel.bulkDelete).toHaveBeenCalled();
        });

        it('should reply with success embed', async () => {
            await purgeCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Messages Deleted');
            expect(replyCall.embeds[0].description).toContain('10');
        });

        it('should send mod log', async () => {
            await purgeCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'purge',
                    moderator: mockInteraction.user
                })
            );
        });

        it('should include channel info in response', async () => {
            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const channelField = replyCall.embeds[0].fields.find(f => f.name.includes('Channel'));
            expect(channelField.value).toBe('test-channel');
        });
    });

    describe('execute - Filter by User', () => {
        it('should filter messages by specific user', async () => {
            const targetUser = createMockUser({ id: '123456789', tag: 'Target#0001' });
            mockInteraction.options.getUser.mockReturnValue(targetUser);

            // Create messages from different users
            const mixedMessages = new Map();
            mixedMessages.set('msg-1', { id: 'msg-1', author: { id: '123456789' } });
            mixedMessages.set('msg-2', { id: 'msg-2', author: { id: '999999999' } });
            mixedMessages.set('msg-3', { id: 'msg-3', author: { id: '123456789' } });
            mockChannel.messages.fetch.mockResolvedValue(mixedMessages);

            await purgeCommand.execute(mockInteraction);
            
            expect(mockChannel.bulkDelete).toHaveBeenCalled();
            const deleteCall = mockChannel.bulkDelete.mock.calls[0][0];
            // Should only include messages from target user
            expect([...deleteCall.values()].every(m => m.author.id === '123456789')).toBe(true);
        });

        it('should show filtered user in response', async () => {
            const targetUser = createMockUser({ id: '123456789', tag: 'Target#0001' });
            mockInteraction.options.getUser.mockReturnValue(targetUser);

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const filterField = replyCall.embeds[0].fields.find(f => f.name.includes('Filtered'));
            expect(filterField.value).toContain('Target#0001');
        });
    });

    describe('execute - Error Cases', () => {
        it('should handle no messages found', async () => {
            mockChannel.messages.fetch.mockResolvedValue(new Map());

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('No Messages Found');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle no messages from filtered user', async () => {
            const targetUser = createMockUser({ id: '999888777', tag: 'NoMessages#0001' });
            mockInteraction.options.getUser.mockReturnValue(targetUser);

            // Messages from different user
            const messages = new Map();
            messages.set('msg-1', { id: 'msg-1', author: { id: '123456789' } });
            mockChannel.messages.fetch.mockResolvedValue(messages);

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('No Messages Found');
            expect(replyCall.embeds[0].description).toContain('NoMessages#0001');
        });

        it('should handle missing bot permissions', async () => {
            mockChannel.permissionsFor.mockReturnValue({
                has: vi.fn().mockReturnValue(false)
            });

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Missing Permissions');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle bulk delete error', async () => {
            mockChannel.bulkDelete.mockRejectedValue(new Error('Bulk delete failed'));

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid amount', async () => {
            mockInteraction.options.getInteger.mockReturnValue(0);

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Amount');
        });

        it('should reject amount over 100', async () => {
            mockInteraction.options.getInteger.mockReturnValue(150);

            await purgeCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Amount');
        });
    });

    describe('execute - Reason Handling', () => {
        it('should use provided reason', async () => {
            mockInteraction.options.getString.mockReturnValue('Cleaning up spam');

            await purgeCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    reason: 'Cleaning up spam'
                })
            );
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);

            await purgeCommand.execute(mockInteraction);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    reason: 'No reason provided'
                })
            );
        });
    });
});
