import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn(),
    setData: vi.fn()
}));

vi.mock('../../src/utils/integrationClients.js', () => ({
    checkTwitchStream: vi.fn(),
    checkYoutubeUploads: vi.fn(),
    checkRssFeed: vi.fn()
}));

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn().mockResolvedValue(null),
    withLock: vi.fn((_redis: unknown, _key: string, _owner: string, fn: () => Promise<unknown>) => fn())
}));

import { getData, setData } from '../../src/utils/db.js';
import { checkTwitchStream, checkYoutubeUploads } from '../../src/utils/integrationClients.js';
import { getLockRedis } from '../../src/utils/lock.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);
const mockCheckTwitch = vi.mocked(checkTwitchStream);
const mockCheckYoutube = vi.mocked(checkYoutubeUploads);
const mockGetLockRedis = vi.mocked(getLockRedis);

describe('integrationPoller', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.resetAllMocks();
        vi.useFakeTimers();
        mockGetLockRedis.mockResolvedValue(null);
    });

    it('init starts interval timers for each poller type', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        const mockClient = { channels: { cache: { get: vi.fn() } } };
        const mockConfig = { integrations: { pollInterval: { twitch: 60000, youtube: 60000, rss: 120000 }, twitchClientId: '', twitchClientSecret: '', youtubeApiKey: '' } };

        poller.initIntegrationPoller(mockClient as unknown as Client, mockConfig);
        expect(vi.getTimerCount()).toBeGreaterThanOrEqual(3);

        poller.stopIntegrationPoller();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stopIntegrationPoller does not throw when not started', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        expect(() => poller.stopIntegrationPoller()).not.toThrow();
    });

    it('tears down the previous generation before direct reinitialization', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        mockGetData.mockResolvedValue({
            subscriptions: [
                { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'channel' }
            ]
        } as never);
        mockCheckYoutube.mockResolvedValue([] as never);

        const config = {
            integrations: {
                pollInterval: { twitch: 10000, youtube: 0, rss: 0 },
                twitchClientId: '',
                twitchClientSecret: '',
                youtubeApiKey: 'youtube-key'
            }
        };
        const client = { channels: { cache: { get: vi.fn() } } };

        poller.initIntegrationPoller(client as unknown as Client, config);
        expect(vi.getTimerCount()).toBe(2);

        poller.initIntegrationPoller(client as unknown as Client, config);
        expect(vi.getTimerCount()).toBe(2);

        await vi.advanceTimersByTimeAsync(5000);

        expect(mockCheckYoutube).toHaveBeenCalledTimes(1);
        poller.stopIntegrationPoller();
    });

    it('ignores in-flight results from a stopped generation after reinitialization', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        mockGetData.mockResolvedValue({
            subscriptions: [
                { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'channel' }
            ]
        } as never);
        mockSetData.mockResolvedValue(undefined as never);

        const video = {
            title: 'Video',
            description: 'Description',
            thumbnail: 'thumbnail',
            videoId: 'video-1',
            publishedAt: new Date().toISOString()
        };
        let resolveStarted!: () => void;
        const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
        let releaseCheck!: () => void;
        const checkGate = new Promise<void>((resolve) => { releaseCheck = resolve; });
        mockCheckYoutube.mockImplementationOnce(async() => {
            resolveStarted();
            await checkGate;
            return [video];
        });

        const oldClient = { channels: { cache: { get: vi.fn() } } };
        const newSend = vi.fn(() => Promise.resolve({}));
        const newClient = {
            channels: {
                cache: {
                    get: vi.fn(() => ({ isTextBased: () => true, send: newSend }))
                }
            }
        };

        const config = {
            integrations: {
                pollInterval: { twitch: 0, youtube: 0, rss: 0 },
                twitchClientId: '',
                twitchClientSecret: '',
                youtubeApiKey: 'youtube-key'
            }
        };
        poller.initIntegrationPoller(oldClient as unknown as Client, config);
        const oldPoll = poller.pollYoutubeSubscriptions();
        await started;

        poller.stopIntegrationPoller();
        poller.initIntegrationPoller(newClient as unknown as Client, config);
        releaseCheck();
        await oldPoll;

        expect(newSend).not.toHaveBeenCalled();
        expect(mockSetData).not.toHaveBeenCalled();
        poller.stopIntegrationPoller();
    });

    it('drains an in-flight old write before persisting the reinitialized generation', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

        const stored: {
            subscriptions: Array<{
                id: string;
                type: 'youtube';
                target_id: string;
                channel_id: string;
                last_checked?: string;
            }>;
        } = {
            subscriptions: [
                { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'channel' }
            ]
        };
        mockGetData.mockImplementation(async() => structuredClone(stored) as never);

        let releaseOldWrite!: () => void;
        const oldWriteGate = new Promise<void>((resolve) => { releaseOldWrite = resolve; });
        let resolveOldWriteStarted!: () => void;
        const oldWriteStarted = new Promise<void>((resolve) => { resolveOldWriteStarted = resolve; });
        let resolveNewCheckStarted!: () => void;
        const newCheckStarted = new Promise<void>((resolve) => { resolveNewCheckStarted = resolve; });
        let setDataCalls = 0;
        mockSetData.mockImplementation(async(_store, data) => {
            setDataCalls += 1;
            if (setDataCalls === 1) {
                resolveOldWriteStarted();
                await oldWriteGate;
            }
            Object.assign(stored, structuredClone(data));
        });

        const oldVideo = {
            title: 'Old video',
            description: 'Description',
            thumbnail: 'thumbnail',
            videoId: 'old-video',
            publishedAt: new Date().toISOString()
        };
        const newVideo = { ...oldVideo, title: 'New video', videoId: 'new-video' };
        mockCheckYoutube
            .mockResolvedValueOnce([oldVideo] as never)
            .mockImplementationOnce(async() => {
                resolveNewCheckStarted();
                return [newVideo] as never;
            });

        const config = {
            integrations: {
                pollInterval: { twitch: 0, youtube: 0, rss: 0 },
                twitchClientId: '',
                twitchClientSecret: '',
                youtubeApiKey: 'youtube-key'
            }
        };
        const client = { channels: { cache: { get: vi.fn() } } };
        poller.initIntegrationPoller(client as unknown as Client, config);
        const oldPoll = poller.pollYoutubeSubscriptions();
        await oldWriteStarted;

        poller.initIntegrationPoller(client as unknown as Client, config);
        vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
        const newPoll = poller.pollYoutubeSubscriptions();

        expect(setDataCalls).toBe(1);
        releaseOldWrite();
        await newCheckStarted;
        await Promise.all([oldPoll, newPoll]);

        expect(setDataCalls).toBe(2);
        expect(stored.subscriptions[0]?.last_checked).toBe('2026-01-01T00:00:01.000Z');
        poller.stopIntegrationPoller();
    });

    it('bounds concurrent subscription checks using the configured limit', async() => {
        vi.useRealTimers();
        const poller = await import('../../src/utils/integrationPoller.js');
        const subscriptions = Array.from({ length: 5 }, (_, index) => ({
            id: `tw${index}`,
            type: 'twitch',
            target_id: `streamer-${index}`,
            channel_id: 'channel'
        }));
        mockGetData.mockResolvedValue({ subscriptions } as never);
        mockSetData.mockResolvedValue(undefined as never);
        let active = 0;
        let maximum = 0;
        const release: Array<() => void> = [];
        mockCheckTwitch.mockImplementation(async() => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise<void>((resolve) => { release.push(resolve); });
            active -= 1;
            return { live: false };
        });

        const client = { channels: { cache: { get: vi.fn() } } };
        poller.initIntegrationPoller(client as unknown as Client, {
            integrations: {
                pollInterval: { twitch: 0, youtube: 0, rss: 0 },
                twitchClientId: 'client-id',
                twitchClientSecret: 'secret',
                youtubeApiKey: '',
                pollConcurrency: { twitch: 2 }
            }
        });
        const polling = poller.pollTwitchSubscriptions();

        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(maximum).toBe(2);
        release.splice(0).forEach((resolve) => { resolve(); });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        release.splice(0).forEach((resolve) => { resolve(); });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        release.splice(0).forEach((resolve) => { resolve(); });
        await polling;
    });

    it('isolates a failed subscription from the remaining polling batch', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        mockGetData.mockResolvedValue({
            subscriptions: [
                { id: 'failed', type: 'twitch', target_id: 'bad', channel_id: 'channel' },
                { id: 'healthy', type: 'twitch', target_id: 'good', channel_id: 'channel' }
            ]
        } as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckTwitch
            .mockRejectedValueOnce(new Error('provider failure'))
            .mockResolvedValueOnce({ live: false } as never);

        poller.initIntegrationPoller({ channels: { cache: { get: vi.fn() } } } as unknown as Client, {
            integrations: {
                pollInterval: { twitch: 0, youtube: 0, rss: 0 },
                twitchClientId: 'client-id',
                twitchClientSecret: 'secret',
                youtubeApiKey: ''
            }
        });

        await poller.pollTwitchSubscriptions();

        expect(mockCheckTwitch).toHaveBeenCalledTimes(2);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('coalesces scheduled ticks while a slow provider batch is running', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        const subscriptions = Array.from({ length: 3 }, (_, index) => ({
            id: `tw${index}`,
            type: 'twitch',
            target_id: `streamer-${index}`,
            channel_id: 'channel'
        }));
        mockGetData.mockResolvedValue({ subscriptions } as never);
        mockSetData.mockResolvedValue(undefined as never);

        let calls = 0;
        const release: Array<() => void> = [];
        mockCheckTwitch.mockImplementation(async() => {
            calls += 1;
            if (calls <= subscriptions.length) {
                await new Promise<void>((resolve) => { release.push(resolve); });
            }
            return { live: false };
        });

        poller.initIntegrationPoller({ channels: { cache: { get: vi.fn() } } } as unknown as Client, {
            integrations: {
                pollInterval: { twitch: 100, youtube: 0, rss: 0 },
                twitchClientId: 'client-id',
                twitchClientSecret: 'secret',
                youtubeApiKey: '',
                pollConcurrency: { twitch: 1 }
            }
        });

        await vi.advanceTimersByTimeAsync(500);
        expect(calls).toBe(1);

        release.shift()?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toBe(2);

        release.shift()?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toBe(3);

        release.shift()?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toBe(3);
        poller.stopIntegrationPoller();
    });
});
