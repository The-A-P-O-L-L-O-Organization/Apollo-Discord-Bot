// Embed Command Tests
// Tests for the embed command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import embedCommand from '../../src/plugins/utility/commands/embed.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockChannel
} from '../mocks/discord.js';

vi.mock('../../src/utils/automod.js', () => ({
    getAutomodConfig: vi.fn(),
    checkBannedWords: vi.fn().mockReturnValue(null)
}));

import { getAutomodConfig, checkBannedWords } from '../../src/utils/automod.js';

describe('Embed Command', () => {
    let mockInteraction;
    let mockChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        getAutomodConfig.mockResolvedValue({
            enabled: true,
            bannedWords: []
        });
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'test-channel'
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            channel: mockChannel,
            options: {
                getString: vi.fn(),
                getBoolean: vi.fn(),
                getAttachment: vi.fn().mockReturnValue(null)
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
        it('should create embed with title only', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('successfully');
            expect(replyCall.flags).toBe(64);
        });

        it('should create embed with description only', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'description') {return 'Test Description';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should create embed with all options', async() => {
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

        it('should handle hex color without hash', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                if (name === 'color') {return 'FF0000';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should use default color when none provided', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no title or description provided', async() => {
            mockInteraction.options.getString.mockReturnValue(null);

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('must provide at least a title or description');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject invalid hex color', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                if (name === 'color') {return 'invalid';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid color format');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject invalid image URL', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                if (name === 'image') {return 'not-a-url';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid image URL');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject invalid thumbnail URL', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                if (name === 'thumbnail') {return 'not-a-url';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid thumbnail URL');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject invalid title URL', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                if (name === 'url') {return 'not-a-url';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid URL');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle send failure gracefully', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                return null;
            });
            mockChannel.send.mockRejectedValue(new Error('Permission denied'));

            await embedCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Failed to create');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle very long description', async() => {
            const longDescription = 'x'.repeat(4000);
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'description') {return longDescription;}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should handle special characters in title', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test <b>Title</b> & "Special"';}
                return null;
            });

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should add timestamp when requested', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Test Title';}
                return null;
            });
            mockInteraction.options.getBoolean.mockReturnValue(true);

            await embedCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });

    describe('execute - Banned Word Filtering', () => {
        beforeEach(() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'My Embed Title';}
                return null;
            });
            getAutomodConfig.mockResolvedValue({
                enabled: true,
                bannedWords: ['badword', 'naughty']
            });
            checkBannedWords.mockImplementation((content, bannedWords) => {
                const lower = content.toLowerCase();
                for (const w of bannedWords) {
                    if (lower.includes(w)) {return w;}
                }
                return null;
            });
        });

        it('should reject embed with banned word in title', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'This has naughty content';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('banned word');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject embed with banned word in description', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Safe Title';}
                if (name === 'description') {return 'This is a badword here';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('banned word');
        });

        it('should reject embed with banned word in footer', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Safe Title';}
                if (name === 'footer') {return 'naughty footer text';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('banned word');
        });

        it('should reject embed with banned word in author', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Safe Title';}
                if (name === 'author') {return 'badword author';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('banned word');
        });

        it('should reject embed with banned word in .md file content', async() => {
            mockInteraction.options.getString.mockImplementation(() => null);
            mockInteraction.options.getAttachment.mockReturnValue({
                name: 'content.md',
                url: 'https://cdn.discord.com/content.md'
            });
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('# naughty\n\nNormal text')
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('banned word');
        });

        it('should allow embed with no banned words', async() => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Safe Title';}
                if (name === 'description') {return 'Clean description';}
                if (name === 'footer') {return 'Clean footer';}
                if (name === 'author') {return 'Clean author';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should skip banned word check when automod is disabled', async() => {
            getAutomodConfig.mockResolvedValue({
                enabled: false,
                bannedWords: ['badword']
            });
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'badword title';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should skip banned word check when bannedWords is empty', async() => {
            getAutomodConfig.mockResolvedValue({
                enabled: true,
                bannedWords: []
            });
            checkBannedWords.mockReturnValue(null);
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'My Embed Title';}
                return null;
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).toHaveBeenCalled();
        });
    });

    describe('execute - Markdown File Attachment', () => {
        beforeEach(() => {
            mockInteraction.options.getString.mockReturnValue(null);
            mockInteraction.options.getBoolean.mockReturnValue(null);
            mockInteraction.options.getAttachment = vi.fn().mockReturnValue(null);
        });

        it('should reject non-.md file attachments', async() => {
            mockInteraction.options.getAttachment.mockReturnValue({
                name: 'readme.txt',
                url: 'https://cdn.discord.com/readme.txt'
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('.md');
            expect(replyCall.flags).toBe(64);
        });

        it('should fetch and parse .md attachment', async() => {
            const attachment = {
                name: 'guide.md',
                url: 'https://cdn.discord.com/guide.md'
            };
            mockInteraction.options.getAttachment.mockReturnValue(attachment);
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('# Hello\n\n## Section 1\n\nContent here')
            });

            await embedCommand.execute(mockInteraction);

            expect(global.fetch).toHaveBeenCalledWith(attachment.url);
            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.title).toBe('Hello');
            expect(sendCall.embeds[0].data.fields[0].name).toBe('Section 1');
            expect(sendCall.embeds[0].data.fields[0].value).toBe('Content here');
        });

        it('manual title takes precedence over parsed # heading', async() => {
            const attachment = {
                name: 'guide.md',
                url: 'https://cdn.discord.com/guide.md'
            };
            mockInteraction.options.getAttachment.mockReturnValue(attachment);
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Manual Title';}
                return null;
            });
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('# File Title\n\n## Section\n\nContent')
            });

            await embedCommand.execute(mockInteraction);

            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.title).toBe('Manual Title');
        });

        it('should handle empty .md file', async() => {
            mockInteraction.options.getAttachment.mockReturnValue({
                name: 'empty.md',
                url: 'https://cdn.discord.com/empty.md'
            });
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('')
            });

            await embedCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('empty');
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should handle fetch errors gracefully', async() => {
            mockInteraction.options.getAttachment.mockReturnValue({
                name: 'broken.md',
                url: 'https://cdn.discord.com/broken.md'
            });
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            await embedCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Could not read');
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('allows file-only invocation with no title or description options', async() => {
            const attachment = {
                name: 'doc.md',
                url: 'https://cdn.discord.com/doc.md'
            };
            mockInteraction.options.getAttachment.mockReturnValue(attachment);
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('Descriptive text\n\n# Doc Title\n\n## Section\n\nContent')
            });

            await embedCommand.execute(mockInteraction);

            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.title).toBe('Doc Title');
            expect(sendCall.embeds[0].data.fields[0].name).toBe('Section');
        });

        it('sets footer to rendered from filename', async() => {
            const attachment = {
                name: 'guide.md',
                url: 'https://cdn.discord.com/guide.md'
            };
            mockInteraction.options.getAttachment.mockReturnValue(attachment);
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('# Title\n\nContent')
            });

            await embedCommand.execute(mockInteraction);

            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.footer.text).toContain('guide.md');
        });

        it('manual description takes precedence over parsed preamble', async() => {
            const attachment = {
                name: 'guide.md',
                url: 'https://cdn.discord.com/guide.md'
            };
            mockInteraction.options.getAttachment.mockReturnValue(attachment);
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'title') {return 'Title';}
                if (name === 'description') {return 'Manual desc';}
                return null;
            });
            global.fetch = vi.fn().mockResolvedValue({
                text: vi.fn().mockResolvedValue('Preamble desc\n\n# Title\n\n## Section\n\nContent')
            });

            await embedCommand.execute(mockInteraction);

            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.description).toBe('Manual desc');
        });
    });
});
