import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { checkTwitchStream, checkYoutubeUploads, checkRssFeed } from '../../src/utils/integrationClients.js';
import {
    initIntegrationPoller,
    stopIntegrationPoller,
    pollTwitchSubscriptions,
    pollYoutubeSubscriptions,
    pollRssSubscriptions
} from '../../src/utils/integrationPoller.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);
const mockCheckTwitch = vi.mocked(checkTwitchStream);
const mockCheckYoutube = vi.mocked(checkYoutubeUploads);
const mockCheckRss = vi.mocked(checkRssFeed);

function createStore(subscriptions: unknown[]) {
    return { subscriptions: structuredClone(subscriptions) };
}

function createMockClient() {
    const send = vi.fn(() => Promise.resolve({}));
    return {
        client: {
            channels: { cache: { get: vi.fn(() => ({ isTextBased: () => true, send })) } }
        } as unknown as Client,
        send
    };
}

const pollerConfig = {
    integrations: {
        twitchClientId: 'tid',
        twitchClientSecret: 'tsecret',
        youtubeApiKey: 'ykey',
        pollInterval: { twitch: 0, youtube: 0, rss: 0 }
    }
};

describe('integrationPoller idempotent database operations', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        stopIntegrationPoller();
    });

    it('serializes concurrent subscription updates so no last_checked write is lost', async () => {
        const store = createStore([
            { id: 'tw1', type: 'twitch', target_id: 'streamer', channel_id: 'c1' },
            { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'c1' }
        ]);
        let resolveRead!: () => void;
        const readGate = new Promise<void>((resolve) => { resolveRead = resolve; });
        mockGetData.mockImplementation(() => readGate.then(() => structuredClone(store)) as never);
        mockSetData.mockImplementation(((_store: string, data: unknown) => {
            Object.assign(store, structuredClone(data));
            return Promise.resolve();
        }) as never);
        mockCheckTwitch.mockResolvedValue({ live: true, title: 'Stream!' } as never);
        mockCheckYoutube.mockResolvedValue([{
            title: 'Video',
            description: 'desc',
            thumbnail: 'thumb',
            videoId: 'v1',
            publishedAt: new Date().toISOString()
        }] as never);

        const { client } = createMockClient();
        initIntegrationPoller(client, pollerConfig);

        const twitchRun = pollTwitchSubscriptions();
        const youtubeRun = pollYoutubeSubscriptions();
        resolveRead();
        await Promise.all([twitchRun, youtubeRun]);

        const subs = store.subscriptions as { id: string; last_checked?: string }[];
        expect(subs.find((s) => s.id === 'tw1')?.last_checked).toBeDefined();
        expect(subs.find((s) => s.id === 'yt1')?.last_checked).toBeDefined();
    });

    it('notifies a new youtube video exactly once across consecutive polls', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        const video = {
            title: 'Video',
            description: 'desc',
            thumbnail: 'thumb',
            videoId: 'v1',
            publishedAt: new Date().toISOString()
        };
        mockCheckYoutube.mockResolvedValue([video] as never);

        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);

        await pollYoutubeSubscriptions();
        await pollYoutubeSubscriptions();

        expect(send).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('notifies an rss item exactly once across consecutive polls', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'rss1', type: 'rss', target_id: 'https://example.com/feed', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckRss.mockResolvedValue({
            feedTitle: 'Feed',
            items: [{ title: 'Item', link: 'https://example.com/1', guid: 'r1', pubDate: new Date().toISOString() }]
        } as never);

        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);

        await pollRssSubscriptions();
        await pollRssSubscriptions();

        expect(send).toHaveBeenCalledTimes(1);
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });

    it('updates last_checked for offline twitch streams without notifying', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'tw1', type: 'twitch', target_id: 'streamer', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckTwitch.mockResolvedValue({ live: false } as never);

        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);

        await pollTwitchSubscriptions();

        expect(send).not.toHaveBeenCalled();
        expect(mockSetData).toHaveBeenCalledTimes(1);
    });
});
