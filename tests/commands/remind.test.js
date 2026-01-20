// Remind Command Tests
// Tests for the remind command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import remindCommand from '../../src/commands/remind.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockChannel,
    createMockGuild
} from '../mocks/discord.js';

// Mock the reminderScheduler module
vi.mock('../../src/utils/reminderScheduler.js', () => ({
    addReminder: vi.fn(),
    parseTimeString: vi.fn()
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        reminders: {
            maxDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
        }
    }
}));

import { addReminder, parseTimeString } from '../../src/utils/reminderScheduler.js';

describe('Remind Command', () => {
    let mockInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            channel: createMockChannel({ id: '111222333' }),
            guild: createMockGuild({ id: '987654321' }),
            options: {
                getString: vi.fn()
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(remindCommand.data.name).toBe('remind');
        });

        it('should have a description', () => {
            expect(remindCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(remindCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should create reminder successfully', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '1h';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(60 * 60 * 1000); // 1 hour

            await remindCommand.execute(mockInteraction);
            
            expect(addReminder).toHaveBeenCalled();
            const reminderArg = addReminder.mock.calls[0][0];
            expect(reminderArg.message).toBe('Test reminder');
            expect(reminderArg.userId).toBe('123456789');
            expect(reminderArg.channelId).toBe('111222333');
        });

        it('should reply with confirmation', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '1h';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(60 * 60 * 1000);

            await remindCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Reminder set');
            expect(replyCall.content).toContain('Test reminder');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should include reminder ID in response', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '1h';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(60 * 60 * 1000);

            await remindCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Reminder ID');
        });

        it('should include timestamp in response', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '1h';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(60 * 60 * 1000);

            await remindCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('<t:');
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject invalid time format', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return 'invalid';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(null);

            await remindCommand.execute(mockInteraction);
            
            expect(addReminder).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid time format');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject zero duration', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '0m';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(0);

            await remindCommand.execute(mockInteraction);
            
            expect(addReminder).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid time format');
        });

        it('should reject negative duration', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '-1h';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(-3600000);

            await remindCommand.execute(mockInteraction);
            
            expect(addReminder).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Invalid time format');
        });

        it('should reject duration exceeding max', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '60d';
                if (name === 'message') return 'Test reminder';
                return null;
            });
            parseTimeString.mockReturnValue(60 * 24 * 60 * 60 * 1000); // 60 days

            await remindCommand.execute(mockInteraction);
            
            expect(addReminder).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('cannot exceed');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Time Parsing', () => {
        it('should pass time string to parser', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '2h30m';
                if (name === 'message') return 'Test';
                return null;
            });
            parseTimeString.mockReturnValue(9000000);

            await remindCommand.execute(mockInteraction);
            
            expect(parseTimeString).toHaveBeenCalledWith('2h30m');
        });
    });

    describe('execute - Guild Context', () => {
        it('should use guild ID when in server', async () => {
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '1h';
                if (name === 'message') return 'Test';
                return null;
            });
            parseTimeString.mockReturnValue(3600000);

            await remindCommand.execute(mockInteraction);
            
            const reminderArg = addReminder.mock.calls[0][0];
            expect(reminderArg.guildId).toBe('987654321');
        });

        it('should use "dm" when not in server', async () => {
            mockInteraction.guild = null;
            mockInteraction.options.getString.mockImplementation(name => {
                if (name === 'time') return '1h';
                if (name === 'message') return 'Test';
                return null;
            });
            parseTimeString.mockReturnValue(3600000);

            await remindCommand.execute(mockInteraction);
            
            const reminderArg = addReminder.mock.calls[0][0];
            expect(reminderArg.guildId).toBe('dm');
        });
    });
});
