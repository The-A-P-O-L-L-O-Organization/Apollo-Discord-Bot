// Reminders Command Tests
// Tests for the reminders list command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import remindersCommand from '../../src/commands/reminders.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';

// Mock the reminderScheduler module
vi.mock('../../src/utils/reminderScheduler.js', () => ({
    getUserReminders: vi.fn()
}));

import { getUserReminders } from '../../src/utils/reminderScheduler.js';

describe('Reminders Command', () => {
    let mockInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' })
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(remindersCommand.data.name).toBe('reminders');
        });

        it('should have a description', () => {
            expect(remindersCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(remindersCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should display reminders list', async () => {
            const futureTime = Date.now() + 3600000; // 1 hour from now
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'Reminder 1', remindAt: futureTime },
                { id: 'rem-2', message: 'Reminder 2', remindAt: futureTime + 7200000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('Your Reminders');
            expect(replyCall.embeds[0].description).toContain('2');
        });

        it('should sort reminders by time (soonest first)', async () => {
            const now = Date.now();
            getUserReminders.mockReturnValue([
                { id: 'rem-2', message: 'Later', remindAt: now + 7200000 },
                { id: 'rem-1', message: 'Sooner', remindAt: now + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields[0].name).toContain('rem-1');
        });

        it('should show reminder ID', async () => {
            getUserReminders.mockReturnValue([
                { id: 'test-reminder-id', message: 'Test', remindAt: Date.now() + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields[0].name).toContain('test-reminder-id');
        });

        it('should show reminder message', async () => {
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'My important reminder', remindAt: Date.now() + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields[0].value).toContain('My important reminder');
        });

        it('should truncate long messages', async () => {
            const longMessage = 'x'.repeat(300);
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: longMessage, remindAt: Date.now() + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields[0].value).toContain('...');
            expect(fields[0].value.length).toBeLessThan(350);
        });

        it('should include timestamp for each reminder', async () => {
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'Test', remindAt: Date.now() + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields[0].value).toContain('<t:');
        });

        it('should limit display to 25 reminders', async () => {
            const reminders = Array(30).fill(null).map((_, i) => ({
                id: `rem-${i}`,
                message: `Reminder ${i}`,
                remindAt: Date.now() + (i + 1) * 3600000
            }));
            getUserReminders.mockReturnValue(reminders);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            // 25 reminder fields + 1 "and X more" field
            expect(replyCall.embeds[0].fields.length).toBeLessThanOrEqual(26);
        });

        it('should show count of additional reminders when over 25', async () => {
            const reminders = Array(30).fill(null).map((_, i) => ({
                id: `rem-${i}`,
                message: `Reminder ${i}`,
                remindAt: Date.now() + (i + 1) * 3600000
            }));
            getUserReminders.mockReturnValue(reminders);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const lastField = replyCall.embeds[0].fields[replyCall.embeds[0].fields.length - 1];
            expect(lastField.value).toContain('5 more');
        });

        it('should be ephemeral', async () => {
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'Test', remindAt: Date.now() + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - No Reminders', () => {
        it('should show message when no reminders', async () => {
            getUserReminders.mockReturnValue([]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('no active reminders');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should suggest using /remind command', async () => {
            getUserReminders.mockReturnValue([]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('/remind');
        });
    });

    describe('execute - Expired Reminders', () => {
        it('should filter out expired reminders', async () => {
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'Expired', remindAt: Date.now() - 3600000 }, // 1 hour ago
                { id: 'rem-2', message: 'Active', remindAt: Date.now() + 3600000 }   // 1 hour from now
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('1'); // Only 1 active
        });

        it('should show no reminders if all expired', async () => {
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'Expired', remindAt: Date.now() - 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('no active reminders');
        });
    });

    describe('execute - Footer', () => {
        it('should show cancel reminder hint in footer', async () => {
            getUserReminders.mockReturnValue([
                { id: 'rem-1', message: 'Test', remindAt: Date.now() + 3600000 }
            ]);

            await remindersCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].footer.text).toContain('/cancelreminder');
        });
    });
});
