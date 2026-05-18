// Reminder Scheduler Database Load Tests
// Tests for loading reminders from database on startup

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn(),
    setData: vi.fn()
}));

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn().mockResolvedValue(null),
    withLock: vi.fn()
}));

vi.mock('../../src/config/config.js', () => ({
    config: {
        podId: 'test-pod',
        database: { type: 'sqlite' },
        reminders: { checkInterval: 60000 }
    }
}));

describe('Reminder Scheduler Database Loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should load reminders from database on initialization', async () => {
        const { getData } = await import('../../src/utils/db.js');
        
        // Mock database return
        const mockReminders = {
            reminders: [
                {
                    id: '1',
                    userId: '123',
                    message: 'Test reminder 1',
                    remindAt: Date.now() + 10000,
                    createdAt: Date.now()
                },
                {
                    id: '2',
                    userId: '456',
                    message: 'Test reminder 2',
                    remindAt: Date.now() + 20000,
                    createdAt: Date.now()
                }
            ]
        };
        
        getData.mockResolvedValue(mockReminders);
        
        // Import and initialize
        const { initReminderScheduler, stopReminderScheduler, getUserReminders } = 
            await import('../../src/utils/reminderScheduler.js');
        
        const client = { users: {}, channels: {} };
        await initReminderScheduler(client);
        
        // Wait for initialization
        await new Promise(r => setTimeout(r, 50));
        
        // Verify reminders are loaded
        expect(getData).toHaveBeenCalled();
        const reminders123 = await getUserReminders('123');
        const reminders456 = await getUserReminders('456');
        expect(reminders123).toHaveLength(1);
        expect(reminders456).toHaveLength(1);
        
        stopReminderScheduler();
    });

    it('should handle empty reminder database', async () => {
        const { getData } = await import('../../src/utils/db.js');
        
        // Mock empty database
        getData.mockResolvedValue({ reminders: [] });
        
        const { initReminderScheduler, stopReminderScheduler, getUserReminders } = 
            await import('../../src/utils/reminderScheduler.js');
        
        const client = {};
        await initReminderScheduler(client);
        
        await new Promise(r => setTimeout(r, 50));
        
        expect(getData).toHaveBeenCalled();
        const reminders = await getUserReminders('123');
        expect(reminders).toHaveLength(0);
        
        stopReminderScheduler();
    });

    it('should handle database errors gracefully', async () => {
        const { getData } = await import('../../src/utils/db.js');
        
        // Mock database error
        const error = new Error('Database connection failed');
        getData.mockRejectedValue(error);
        
        const { initReminderScheduler, stopReminderScheduler } = 
            await import('../../src/utils/reminderScheduler.js');
        
        const client = {};
        
        // Should not throw
        await expect(async () => {
            await initReminderScheduler(client);
        }).not.toThrow();
        
        await new Promise(r => setTimeout(r, 50));
        
        stopReminderScheduler();
    });
});
