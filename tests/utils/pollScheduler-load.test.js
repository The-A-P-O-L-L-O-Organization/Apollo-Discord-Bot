// Poll Scheduler Database Load Tests
// Tests for loading polls from database on startup

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
        database: { type: 'sqlite' }
    }
}));

describe('Poll Scheduler Database Loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should load polls from database on initialization', async() => {
        const { getData } = await import('../../src/utils/db.js');
        
        // Mock database return with polls from multiple guilds
        const mockPolls = {
            'guild-1': {
                active: [
                    {
                        id: 'poll-1',
                        question: 'Favorite color?',
                        options: ['Red', 'Blue'],
                        channelId: '123',
                        messageId: '456',
                        endTime: Date.now() + 10000,
                        createdBy: 'user-1'
                    }
                ]
            },
            'guild-2': {
                active: [
                    {
                        id: 'poll-2',
                        question: 'Best language?',
                        options: ['JS', 'Python'],
                        channelId: '789',
                        messageId: '101',
                        endTime: Date.now() + 20000,
                        createdBy: 'user-2'
                    }
                ]
            }
        };
        
        getData.mockResolvedValue(mockPolls);
        
        // Import and initialize
        const { initPollScheduler, stopPollScheduler } = 
            await import('../../src/utils/pollScheduler.js');
        
        const client = { guilds: {}, channels: {} };
        initPollScheduler(client);
        
        // Wait for initialization
        await new Promise(r => setTimeout(r, 50));
        
        // Verify polls are loaded
        expect(getData).toHaveBeenCalled();
        
        stopPollScheduler();
    });

    it('should handle empty poll database', async() => {
        const { getData } = await import('../../src/utils/db.js');
        
        // Mock empty database
        getData.mockResolvedValue({});
        
        const { initPollScheduler, stopPollScheduler } = 
            await import('../../src/utils/pollScheduler.js');
        
        const client = {};
        initPollScheduler(client);
        
        await new Promise(r => setTimeout(r, 50));
        
        expect(getData).toHaveBeenCalled();
        
        stopPollScheduler();
    });

    it('should handle database errors gracefully', async() => {
        const { getData } = await import('../../src/utils/db.js');
        
        // Mock database error
        const error = new Error('Database connection failed');
        getData.mockRejectedValue(error);
        
        const { initPollScheduler, stopPollScheduler } = 
            await import('../../src/utils/pollScheduler.js');
        
        const client = {};
        
        // Should not throw
        expect(() => {
            initPollScheduler(client);
        }).not.toThrow();
        
        await new Promise(r => setTimeout(r, 50));
        
        stopPollScheduler();
    });
});
