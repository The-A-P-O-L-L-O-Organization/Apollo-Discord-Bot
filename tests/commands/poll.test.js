// Poll Command Tests
// Tests for the poll command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pollCommand from '../../src/commands/poll.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockChannel,
    createMockMessage
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    appendToGuildArray: vi.fn(),
    generateId: vi.fn().mockReturnValue('poll-123')
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        polls: {
            maxOptions: 10,
            maxDuration: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
    }
}));

import { appendToGuildArray } from '../../src/utils/dataStore.js';

describe('Poll Command', () => {
    let mockInteraction;
    let mockChannel;
    let mockMessage;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockMessage = createMockMessage({ id: '777888999' });
        mockMessage.react = vi.fn().mockResolvedValue({});
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'general'
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            channel: mockChannel,
            guild: { id: '987654321' },
            options: {
                getString: vi.fn(),
                getBoolean: vi.fn()
            },
            deferReply: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue(mockMessage)
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(pollCommand.data.name).toBe('poll');
        });

        it('should have a description', () => {
            expect(pollCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(pollCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should create poll with two options', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'What is your favorite color?';
                if (name === 'options') return 'Red | Blue';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalled();
            
            const editCall = mockInteraction.editReply.mock.calls[0][0];
            expect(editCall.embeds[0].title).toContain('What is your favorite color?');
        });

        it('should add reactions for each option', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'A | B | C';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            expect(mockMessage.react).toHaveBeenCalledTimes(3);
        });

        it('should handle poll with duration', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                if (name === 'duration') return '1h';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            expect(appendToGuildArray).toHaveBeenCalled();
            const appendCall = appendToGuildArray.mock.calls[0];
            expect(appendCall[0]).toBe('polls');
            expect(appendCall[3].endTime).toBeDefined();
        });

        it('should handle anonymous poll option', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                return null;
            });
            mockInteraction.options.getBoolean.mockReturnValue(true);

            await pollCommand.execute(mockInteraction);
            
            const editCall = mockInteraction.editReply.mock.calls[0][0];
            expect(editCall.embeds[0].footer.text).toContain('Anonymous');
        });

        it('should not save poll without duration', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                return null; // No duration
            });

            await pollCommand.execute(mockInteraction);
            
            expect(appendToGuildArray).not.toHaveBeenCalled();
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject poll with less than 2 options', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Only one option';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('at least 2 options');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject poll with more than max options', async () => {
            const options = Array(11).fill('Option').join(' | ');
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return options;
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('maximum of 10');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid duration format', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                if (name === 'duration') return 'invalid';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid duration');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject duration exceeding max', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                if (name === 'duration') return '8d'; // Exceeds 7 days
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('cannot exceed');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Option Parsing', () => {
        it('should trim whitespace from options', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return '  Yes  |  No  ';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const editCall = mockInteraction.editReply.mock.calls[0][0];
            expect(editCall.embeds[0].description).toContain('Yes');
            expect(editCall.embeds[0].description).toContain('No');
        });

        it('should filter empty options', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | | No | ';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            // Should only have 2 reactions (Yes and No)
            expect(mockMessage.react).toHaveBeenCalledTimes(2);
        });
    });

    describe('execute - Duration Parsing', () => {
        it('should parse minutes correctly', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                if (name === 'duration') return '30m';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const appendCall = appendToGuildArray.mock.calls[0];
            const pollData = appendCall[3];
            expect(pollData.endTime - Date.now()).toBeCloseTo(30 * 60 * 1000, -4);
        });

        it('should parse hours correctly', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                if (name === 'duration') return '2h';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const appendCall = appendToGuildArray.mock.calls[0];
            const pollData = appendCall[3];
            expect(pollData.endTime - Date.now()).toBeCloseTo(2 * 60 * 60 * 1000, -4);
        });

        it('should parse days correctly', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'question') return 'Question?';
                if (name === 'options') return 'Yes | No';
                if (name === 'duration') return '1d';
                return null;
            });

            await pollCommand.execute(mockInteraction);
            
            const appendCall = appendToGuildArray.mock.calls[0];
            const pollData = appendCall[3];
            expect(pollData.endTime - Date.now()).toBeCloseTo(24 * 60 * 60 * 1000, -4);
        });
    });
});
