// Message Delete Event Tests
// Tests for the messageDelete event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageDeleteEvent from '../../src/events/messageDelete.js';
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
    createMessageDeleteEmbed: vi.fn().mockReturnValue({ toJSON: () => ({}) })
}));

import { logEvent, createMessageDeleteEmbed } from '../../src/utils/logger.js';

describe('MessageDelete Event', () => {
    let mockMessage;
    let mockGuild;
    let mockClient;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockMessage = createMockMessage({
            id: '777888999',
            content: 'Deleted message content',
            author: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }),
            guild: mockGuild,
            channel: createMockChannel({ id: '111222333', name: 'general' }),
            partial: false
        });
        
        mockClient = createMockClient();
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(messageDeleteEvent.name).toBe('messageDelete');
        });

        it('should not be a once event', () => {
            expect(messageDeleteEvent.once).toBe(false);
        });
    });

    describe('Success Cases', () => {
        it('should log deleted message for non-bot users', async () => {
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(createMessageDeleteEmbed).toHaveBeenCalledWith(mockMessage);
            expect(logEvent).toHaveBeenCalledWith(
                mockGuild, 
                'messageDelete', 
                expect.anything()
            );
        });

        it('should pass correct guild to logEvent', async () => {
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(logEvent).toHaveBeenCalledWith(
                mockMessage.guild,
                'messageDelete',
                expect.anything()
            );
        });
    });

    describe('Message Filtering', () => {
        it('should ignore DM messages', async () => {
            mockMessage.guild = null;
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
            expect(createMessageDeleteEmbed).not.toHaveBeenCalled();
        });

        it('should ignore bot messages', async () => {
            mockMessage.author.bot = true;
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
            expect(createMessageDeleteEmbed).not.toHaveBeenCalled();
        });

        it('should ignore messages with no author', async () => {
            mockMessage.author = null;
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Partial Message Handling', () => {
        it('should fetch partial messages', async () => {
            mockMessage.partial = true;
            mockMessage.fetch = vi.fn().mockResolvedValue(mockMessage);
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(mockMessage.fetch).toHaveBeenCalled();
        });

        it('should skip logging if partial message fetch fails', async () => {
            mockMessage.partial = true;
            mockMessage.fetch = vi.fn().mockRejectedValue(new Error('Cannot fetch'));
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle message with empty content', async () => {
            mockMessage.content = '';
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(createMessageDeleteEmbed).toHaveBeenCalledWith(mockMessage);
            expect(logEvent).toHaveBeenCalled();
        });

        it('should handle message with attachments', async () => {
            const attachments = new Map();
            attachments.set('123', { url: 'https://example.com/image.png' });
            mockMessage.attachments = attachments;
            
            await messageDeleteEvent.execute(mockMessage, mockClient);
            
            expect(createMessageDeleteEmbed).toHaveBeenCalledWith(mockMessage);
        });

        it('should handle logging errors gracefully', async () => {
            logEvent.mockRejectedValue(new Error('Logging failed'));
            
            await expect(
                messageDeleteEvent.execute(mockMessage, mockClient)
            ).rejects.toThrow('Logging failed');
        });
    });
});
