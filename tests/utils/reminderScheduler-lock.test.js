import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/lock.js', () => ({
  getLockRedis: vi.fn().mockResolvedValue({}),
  withLock: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../src/config/config.js', () => ({
  config: {
    podId: 'test-pod',
    database: { type: 'sqlite' },
    queue: { enabled: true },
    reminders: { checkInterval: 10 },
  },
}));

describe('Reminder scheduler with lock', () => {
  it('should call withLock on each check cycle', async () => {
    const { initReminderScheduler, stopReminderScheduler } =
      await import('../../src/utils/reminderScheduler.js');
    const client = {};
    initReminderScheduler(client);

    await new Promise((r) => setTimeout(r, 100));
    stopReminderScheduler();

    const lockModule = await import('../../src/utils/lock.js');
    expect(lockModule.withLock).toHaveBeenCalled();
  });
});
