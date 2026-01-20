// Message Update Event Tests
// Tests for the messageUpdate event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageUpdateEvent from '../../src/events/messageUpdate.js';
import { 
    createMockMessage,
    createMockUser, 
    createMockGuild,
    createMockChannel,
    createMockClient
} from '../mocks/discord.js';

// Mock the logger module
vi.mock('../../src/utils/logger.js', () => ({
    logEvent: vi.fn().mockResolvedValue(undefined),
    createMessageEditEmbed: vi.fn().mockReturnValue({ toJSON: () => ({}) })
}));

import { logEvent, createMessageEditEmbed } from '../../src/utils/logger.js';

describe('MessageUpdate Event', () => {
    let oldMessage;
    let newMessage;
    let mockGuild;
    let mockClient;
    let mockChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({
            id: '111222333',
            name: 'general'
        });
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockClient = createMockClient();
        
        oldMessage = createMockMessage({
            id: '777888999',
            content: 'Original message',
            author: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }),
            guild: mockGuild,
            channel: mockChannel,
            partial: false
        });
        oldMessage.fetch = vi.fn().mockResolvedValue(oldMessage);
        
        newMessage = createMockMessage({
            id: '777888999',
            content: 'Edited message',
            author: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }),
            guild: mockGuild,
            channel: mockChannel,
            url: 'https://discord.com/channels/987654321/111222333/777888999',
            partial: false
        });
        newMessage.fetch = vi.fn().mockResolvedValue(newMessage);
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(messageUpdateEvent.name).toBe('messageUpdate');
        });

        it('should not be a once event', () => {
            expect(messageUpdateEvent.once).toBe(false);
        });
    });

    describe('Message Filtering', () => {
        it('should ignore DM messages', async () => {
            newMessage.guild = null;
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });

        it('should ignore bot messages', async () => {
            newMessage.author.bot = true;
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });

        it('should ignore when content has not changed', async () => {
            newMessage.content = 'Original message';
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });

        it('should ignore when both old and new content are empty', async () => {
            oldMessage.content = '';
            newMessage.content = '';
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });

        it('should ignore when author is null', async () => {
            newMessage.author = null;
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Partial Message Handling', () => {
        it('should fetch partial old message', async () => {
            oldMessage.partial = true;
            oldMessage.fetch = vi.fn().mockResolvedValue({
                ...oldMessage,
                content: 'Fetched old content',
                partial: false
            });
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(oldMessage.fetch).toHaveBeenCalled();
        });

        it('should fetch partial new message', async () => {
            newMessage.partial = true;
            newMessage.fetch = vi.fn().mockResolvedValue({
                ...newMessage,
                content: 'Fetched new content',
                partial: false
            });
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(newMessage.fetch).toHaveBeenCalled();
        });

        it('should use placeholder when old message fetch fails', async () => {
            oldMessage.partial = true;
            oldMessage.fetch = vi.fn().mockRejectedValue(new Error('Cannot fetch'));
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(createMessageEditEmbed).toHaveBeenCalled();
        });

        it('should return early when new message fetch fails', async () => {
            newMessage.partial = true;
            newMessage.fetch = vi.fn().mockRejectedValue(new Error('Cannot fetch'));
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Logging', () => {
        it('should create message edit embed', async () => {
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(createMessageEditEmbed).toHaveBeenCalledWith(oldMessage, newMessage);
        });

        it('should send log event', async () => {
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).toHaveBeenCalledWith(
                mockGuild,
                'messageEdit',
                expect.anything()
            );
        });

        it('should log when content changes from empty to non-empty', async () => {
            oldMessage.content = '';
            newMessage.content = 'Now has content';
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).toHaveBeenCalled();
        });

        it('should log when content changes from non-empty to empty', async () => {
            oldMessage.content = 'Had content';
            newMessage.content = '';
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle embed-only updates (no content change)', async () => {
            // Both have same content, just embed changed
            oldMessage.content = 'Same content';
            newMessage.content = 'Same content';
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });

        it('should handle messages with special characters', async () => {
            oldMessage.content = 'Hello <@123456789> @everyone';
            newMessage.content = 'Edited <@123456789> @everyone !';
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).toHaveBeenCalled();
        });

        it('should handle very long messages', async () => {
            oldMessage.content = 'a'.repeat(2000);
            newMessage.content = 'b'.repeat(2000);
            
            await messageUpdateEvent.execute(oldMessage, newMessage, mockClient);
            
            expect(logEvent).toHaveBeenCalled();
        });
    });
});
