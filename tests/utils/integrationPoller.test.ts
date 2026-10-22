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

import { getData, setData } from '../../src/utils/db.js';
import { checkTwitchStream } from '../../src/utils/integrationClients.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);
const mockCheckTwitch = vi.mocked(checkTwitchStream);

describe('integrationPoller', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.resetAllMocks();
        vi.useFakeTimers();
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
});
