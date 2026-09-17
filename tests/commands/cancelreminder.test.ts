// Cancel Reminder Command Tests
// Tests for the cancel reminder command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import cancelReminderCommand from '../../src/plugins/utility/commands/cancelreminder.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';
import type { MockCommandInteraction } from '../mocks/discord.js';

// Mock the reminderScheduler module
vi.mock('../../src/utils/reminderScheduler.js', () => ({
    cancelReminder: vi.fn(),
    getUserReminders: vi.fn()
}));

import { cancelReminder, getUserReminders } from '../../src/utils/reminderScheduler.js';

describe('CancelReminder Command', () => {
    let mockInteraction: MockCommandInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            options: {
                getString: vi.fn().mockReturnValue('reminder-123')
            }
        }) as unknown as MockCommandInteraction;
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(cancelReminderCommand.data.name).toBe('cancelreminder');
        });

        it('should have a description', () => {
            expect(cancelReminderCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(cancelReminderCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should cancel reminder successfully', async() => {
            const mockReminder = {
                id: 'reminder-123',
                message: 'Test reminder message',
                userId: '123456789'
            };
            vi.mocked(getUserReminders).mockResolvedValue([mockReminder] as unknown as Awaited<ReturnType<typeof getUserReminders>>);
            vi.mocked(cancelReminder).mockResolvedValue(true);

            await cancelReminderCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(cancelReminder).toHaveBeenCalledWith('reminder-123', '123456789');
            expect(mockInteraction.reply).toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('Reminder cancelled');
            expect(replyCall.content).toContain('Test reminder message');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - Error Cases', () => {
        it('should handle reminder not found', async() => {
            vi.mocked(getUserReminders).mockResolvedValue([]);

            await cancelReminderCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(cancelReminder).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('Could not find');
            expect(replyCall.content).toContain('reminder-123');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle cancellation failure', async() => {
            const mockReminder = {
                id: 'reminder-123',
                message: 'Test reminder message',
                userId: '123456789'
            };
            vi.mocked(getUserReminders).mockResolvedValue([mockReminder] as unknown as Awaited<ReturnType<typeof getUserReminders>>);
            vi.mocked(cancelReminder).mockResolvedValue(false);

            await cancelReminderCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('Failed to cancel');
            expect(replyCall.flags).toBe(64);
        });

        it('should handle reminder belonging to different user', async() => {
            vi.mocked(getUserReminders).mockResolvedValue([]); // Returns empty for this user

            await cancelReminderCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('Could not find');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle empty reminder ID', async() => {
            mockInteraction.options.getString.mockReturnValue('');
            vi.mocked(getUserReminders).mockResolvedValue([]);

            await cancelReminderCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('Could not find');
        });

        it('should match exact reminder ID', async() => {
            const mockReminders = [
                { id: 'reminder-1234', message: 'Other reminder' },
                { id: 'reminder-123', message: 'Correct reminder' }
            ];
            vi.mocked(getUserReminders).mockResolvedValue(mockReminders as unknown as Awaited<ReturnType<typeof getUserReminders>>);
            vi.mocked(cancelReminder).mockResolvedValue(true);

            await cancelReminderCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(cancelReminder).toHaveBeenCalledWith('reminder-123', '123456789');
        });
    });
});
