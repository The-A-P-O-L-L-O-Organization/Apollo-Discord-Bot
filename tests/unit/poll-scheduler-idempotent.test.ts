import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn(),
    setData: vi.fn()
}));

import { getData, setData } from '../../src/utils/db.js';
import { checkPolls } from '../../src/utils/pollScheduler.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);

function createMockChannel(sendImpl?: () => Promise<unknown>) {
    const send = vi.fn(() => sendImpl ? sendImpl() : Promise.resolve({}));
    return {
        channel: {
            isTextBased: () => true,
            messages: {
                fetch: vi.fn(() => Promise.resolve({
                    reactions: { cache: { get: vi.fn(() => undefined) } },
                    embeds: [],
                    edit: vi.fn(() => Promise.resolve({}))
                }))
            },
            send
        },
        send
    };
}

function createMockClient(channel: unknown) {
    return {
        guilds: {
            fetch: vi.fn(() => Promise.resolve({
                channels: { fetch: vi.fn(() => Promise.resolve(channel)) }
            }))
        }
    } as unknown as Client;
}

describe('pollScheduler idempotency', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('claims expired polls in the database before tallying', async () => {
        const now = Date.now();
        const expired = { id: 'p1', question: 'Q?', options: ['A', 'B'], channelId: 'c1', messageId: 'm1', endTime: now - 1000 };
        const active = { id: 'p2', question: 'Q2?', options: ['A'], channelId: 'c1', messageId: 'm2', endTime: now + 60000 };
        mockGetData.mockResolvedValue({ g1: { active: [expired, active] } } as never);

        const { channel, send } = createMockChannel();
        await checkPolls(createMockClient(channel));

        expect(send).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
        const written = mockSetData.mock.calls[0]?.[1] as unknown as { g1: { active: unknown[] } };
        expect(written.g1.active).toEqual([active]);
        expect(mockSetData.mock.invocationCallOrder[0]).toBeLessThan(
            send.mock.invocationCallOrder[0] ?? 0
        );
    });

    it('does not re-tally claimed polls on the next run', async () => {
        const now = Date.now();
        const expired = { id: 'p1', question: 'Q?', options: ['A', 'B'], channelId: 'c1', messageId: 'm1', endTime: now - 1000 };
        mockGetData.mockResolvedValueOnce({ g1: { active: [expired] } } as never);
        mockGetData.mockResolvedValueOnce({ g1: { active: [] } } as never);

        const { channel, send } = createMockChannel();
        const client = createMockClient(channel);

        await checkPolls(client);
        await checkPolls(client);

        expect(send).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('treats a deleted poll message as handled without requeueing', async () => {
        const now = Date.now();
        const expired = { id: 'p1', question: 'Q?', options: ['A'], channelId: 'c1', messageId: 'm1', endTime: now - 1000 };
        mockGetData.mockResolvedValue({ g1: { active: [expired] } } as never);

        const channel = {
            isTextBased: () => true,
            messages: { fetch: vi.fn(() => Promise.reject(new Error('Unknown Message'))) },
            send: vi.fn()
        };
        await checkPolls(createMockClient(channel));

        expect(channel.send).not.toHaveBeenCalled();
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('requeues the poll when posting results fails', async () => {
        const now = Date.now();
        const expired = { id: 'p1', question: 'Q?', options: ['A'], channelId: 'c1', messageId: 'm1', endTime: now - 1000 };
        mockGetData.mockResolvedValueOnce({ g1: { active: [expired] } } as never);
        mockGetData.mockResolvedValueOnce({ g1: { active: [] } } as never);

        const { channel, send } = createMockChannel(() => Promise.reject(new Error('Missing access')));
        await checkPolls(createMockClient(channel));

        expect(send).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(2);
        const requeued = mockSetData.mock.calls[1]?.[1] as unknown as { g1: { active: unknown[] } };
        expect(requeued.g1.active).toEqual([expired]);
    });

    it('does nothing when no client is available', async () => {
        mockGetData.mockResolvedValue({ g1: { active: [{ id: 'p1', endTime: 1 }] } } as never);

        await checkPolls(undefined);

        expect(mockGetData).not.toHaveBeenCalled();
        expect(mockSetData).not.toHaveBeenCalled();
    });
});
