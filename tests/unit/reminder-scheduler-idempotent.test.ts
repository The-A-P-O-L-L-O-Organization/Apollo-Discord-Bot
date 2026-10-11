import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn(),
    setData: vi.fn()
}));

import { getData, setData } from '../../src/utils/db.js';
import { checkReminders } from '../../src/utils/reminderScheduler.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);

function createMockClient(dmImpl?: () => Promise<unknown>, channelSendImpl?: () => Promise<unknown>) {
    const dmSend = vi.fn(() => dmImpl ? dmImpl() : Promise.resolve({}));
    const channelSend = vi.fn(() => channelSendImpl ? channelSendImpl() : Promise.resolve({}));
    const channel = { isTextBased: () => true, send: channelSend };
    return {
        client: {
            users: { fetch: vi.fn(() => Promise.resolve({ send: dmSend })) },
            channels: { fetch: vi.fn(() => Promise.resolve(channel)) }
        } as unknown as Client,
        dmSend,
        channelSend
    };
}

describe('reminderScheduler idempotency', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('claims due reminders in the database before sending', async () => {
        const now = Date.now();
        const due = { id: 'r1', userId: 'u1', channelId: 'c1', message: 'hello', remindAt: now - 1000, createdAt: now - 5000 };
        const future = { id: 'r2', userId: 'u1', channelId: 'c1', message: 'later', remindAt: now + 60000, createdAt: now - 5000 };
        mockGetData.mockResolvedValue({ reminders: [due, future] } as never);

        const { client, dmSend } = createMockClient();
        await checkReminders(client);

        expect(mockSetData).toHaveBeenCalledTimes(1);
        expect(dmSend).toHaveBeenCalledTimes(1);
        const written = mockSetData.mock.calls[0]?.[1] as unknown as { reminders: unknown[] };
        expect(written.reminders).toEqual([future]);
        expect(mockSetData.mock.invocationCallOrder[0]).toBeLessThan(
            dmSend.mock.invocationCallOrder[0] ?? 0
        );
    });

    it('does not re-send claimed reminders on the next run', async () => {
        const now = Date.now();
        const due = { id: 'r1', userId: 'u1', channelId: 'c1', message: 'hello', remindAt: now - 1000, createdAt: now - 5000 };
        mockGetData.mockResolvedValueOnce({ reminders: [due] } as never);
        mockGetData.mockResolvedValueOnce({ reminders: [] } as never);

        const { client, dmSend } = createMockClient();
        await checkReminders(client);
        await checkReminders(client);

        expect(dmSend).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('falls back to the channel when the DM fails and does not requeue', async () => {
        const now = Date.now();
        const due = { id: 'r1', userId: 'u1', channelId: 'c1', message: 'hello', remindAt: now - 1000, createdAt: now - 5000 };
        mockGetData.mockResolvedValue({ reminders: [due] } as never);

        const { client, dmSend, channelSend } = createMockClient(() => Promise.reject(new Error('DMs closed')));
        await checkReminders(client);

        expect(dmSend).toHaveBeenCalledTimes(1);
        expect(channelSend).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('requeues the reminder when all delivery paths fail', async () => {
        const now = Date.now();
        const due = { id: 'r1', userId: 'u1', channelId: 'c1', message: 'hello', remindAt: now - 1000, createdAt: now - 5000 };
        mockGetData.mockResolvedValueOnce({ reminders: [due] } as never);
        mockGetData.mockResolvedValueOnce({ reminders: [] } as never);

        const { client, channelSend } = createMockClient(
            () => Promise.reject(new Error('DMs closed')),
            () => Promise.reject(new Error('Missing access'))
        );
        await checkReminders(client);

        expect(channelSend).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(2);
        const requeued = mockSetData.mock.calls[1]?.[1] as unknown as { reminders: unknown[] };
        expect(requeued.reminders).toEqual([due]);
    });

    it('does nothing when no client is available', async () => {
        mockGetData.mockResolvedValue({ reminders: [{ id: 'r1', remindAt: 1 }] } as never);

        await checkReminders(undefined);

        expect(mockGetData).not.toHaveBeenCalled();
        expect(mockSetData).not.toHaveBeenCalled();
    });
});
