// Embed Command Tests
// Tests for the embed command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import embedCommand from '../../src/commands/embed.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockChannel
} from '../mocks/discord.js';

describe('Embed Command', () => {
    let mockInteraction;
    let mockChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'test-channel'
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            channel: mockChannel,
            options: {
                getString: vi.fn(),
                getBoolean: vi.fn()
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(embedCommand.data.name).toBe('embed');
        });

        it('should have a description', () => {
            expect(embedCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(embedCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should create embed with title only', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('successfully');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should create embed with description only', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'description') return 'Test Description';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should create embed with all options', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                const values = {
                    'title': 'Test Title',
                    'description': 'Test Description',
                    'color': '#FF0000',
                    'image': 'https://example.com/image.png',
                    'thumbnail': 'https://example.com/thumb.png',
                    'footer': 'Test Footer',
                    'author': 'Test Author',
                    'url': 'https://example.com'
                };
                return values[name] || null;
            });
            mockInteraction.options.getBoolean.mockReturnValue(true); // timestamp

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds).toHaveLength(1);
        });

        it('should handle hex color without hash', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                if (name === 'color') return 'FF0000';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should use default color when none provided', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no title or description provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('must provide at least a title or description');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid hex color', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                if (name === 'color') return 'invalid';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid color format');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid image URL', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                if (name === 'image') return 'not-a-url';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid image URL');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid thumbnail URL', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                if (name === 'thumbnail') return 'not-a-url';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid thumbnail URL');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid title URL', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                if (name === 'url') return 'not-a-url';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid URL');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle send failure gracefully', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                return null;
            });
            mockChannel.send.mockRejectedValue(new Error('Permission denied'));

            await embedCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Failed to create');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle very long description', async () => {
            const longDescription = 'x'.repeat(4000);
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'description') return longDescription;
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should handle special characters in title', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test <b>Title</b> & "Special"';
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should add timestamp when requested', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') return 'Test Title';
                return null;
            });
            mockInteraction.options.getBoolean.mockReturnValue(true);

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });
});
