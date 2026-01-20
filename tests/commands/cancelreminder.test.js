// Cancel Reminder Command Tests
// Tests for the cancel reminder command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import cancelReminderCommand from '../../src/commands/cancelreminder.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';

// Mock the reminderScheduler module
vi.mock('../../src/utils/reminderScheduler.js', () => ({
    cancelReminder: vi.fn(),
    getUserReminders: vi.fn()
}));

import { cancelReminder, getUserReminders } from '../../src/utils/reminderScheduler.js';

describe('CancelReminder Command', () => {
    let mockInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            options: {
                getString: vi.fn().mockReturnValue('reminder-123')
            }
        });
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
        it('should cancel reminder successfully', async () => {
            const mockReminder = {
                id: 'reminder-123',
                message: 'Test reminder message',
                userId: '123456789'
            };
            getUserReminders.mockReturnValue([mockReminder]);
            cancelReminder.mockReturnValue(true);

            await cancelReminderCommand.execute(mockInteraction);
            
            expect(cancelReminder).toHaveBeenCalledWith('reminder-123', '123456789');
            expect(mockInteraction.reply).toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Reminder cancelled');
            expect(replyCall.content).toContain('Test reminder message');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Error Cases', () => {
        it('should handle reminder not found', async () => {
            getUserReminders.mockReturnValue([]);

            await cancelReminderCommand.execute(mockInteraction);
            
            expect(cancelReminder).not.toHaveBeenCalled();
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Could not find');
            expect(replyCall.content).toContain('reminder-123');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle cancellation failure', async () => {
            const mockReminder = {
                id: 'reminder-123',
                message: 'Test reminder message',
                userId: '123456789'
            };
            getUserReminders.mockReturnValue([mockReminder]);
            cancelReminder.mockReturnValue(false);

            await cancelReminderCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Failed to cancel');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle reminder belonging to different user', async () => {
            getUserReminders.mockReturnValue([]); // Returns empty for this user

            await cancelReminderCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Could not find');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle empty reminder ID', async () => {
            mockInteraction.options.getString.mockReturnValue('');
            getUserReminders.mockReturnValue([]);

            await cancelReminderCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Could not find');
        });

        it('should match exact reminder ID', async () => {
            const mockReminders = [
                { id: 'reminder-1234', message: 'Other reminder' },
                { id: 'reminder-123', message: 'Correct reminder' }
            ];
            getUserReminders.mockReturnValue(mockReminders);
            cancelReminder.mockReturnValue(true);

            await cancelReminderCommand.execute(mockInteraction);
            
            expect(cancelReminder).toHaveBeenCalledWith('reminder-123', '123456789');
        });
    });
});
