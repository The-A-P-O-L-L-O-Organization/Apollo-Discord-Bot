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

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn(),
    closeLockRedis: vi.fn(),
    withLock: vi.fn((_redis: unknown, _key: string, _owner: string, fn: () => Promise<unknown>) => fn())
}));

import { getData, setData } from '../../src/utils/db.js';
import { checkTwitchStream, checkYoutubeUploads, checkRssFeed } from '../../src/utils/integrationClients.js';
import { NonceStore } from '../../src/queue/nonceStore.js';
import {
    initIntegrationPoller,
    stopIntegrationPoller,
    pollTwitchSubscriptions,
    pollYoutubeSubscriptions,
    pollRssSubscriptions,
    setPollerDedupeForTests,
    buildYoutubeNonce,
    buildRssNonce,
    buildTwitchNonce,
    POLLER_DEDUPE_TTL_SECONDS,
    POLLER_DEDUPE_KEY_PREFIX
} from '../../src/utils/integrationPoller.js';

const mockGetData = vi.mocked(getData);
const mockSetData = vi.mocked(setData);
const mockCheckTwitch = vi.mocked(checkTwitchStream);
const mockCheckYoutube = vi.mocked(checkYoutubeUploads);
const mockCheckRss = vi.mocked(checkRssFeed);

class FakeRedis {
    store = new Map<string, number>();
    evalCalls: unknown[][] = [];
    evalshaCalls: unknown[][] = [];

    async script(): Promise<string> {
        return 'fake-sha';
    }

    async eval(_script: string, _numKeys: number, key: string, ttl: string): Promise<number> {
        this.evalCalls.push([_script, _numKeys, key, ttl]);
        return this.setNxEx(key, ttl);
    }

    async evalsha(_sha: string, _numKeys: number, key: string, ttl: string): Promise<number> {
        this.evalshaCalls.push([_sha, _numKeys, key, ttl]);
        return this.setNxEx(key, ttl);
    }

    async quit(): Promise<void> {
        return undefined;
    }

    private setNxEx(key: string, ttlSeconds: string): number {
        const now = Date.now();
        const expiresAt = this.store.get(key);
        if (expiresAt !== undefined && now < expiresAt) {
            return 0;
        }
        this.store.set(key, now + Number(ttlSeconds) * 1000);
        return 1;
    }
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

function createStore(subscriptions: unknown[]) {
    return { subscriptions: structuredClone(subscriptions) };
}

const pollerConfig = {
    integrations: {
        twitchClientId: 'tid',
        twitchClientSecret: 'tsecret',
        youtubeApiKey: 'ykey',
        pollInterval: { twitch: 0, youtube: 0, rss: 0 }
    }
};

async function makeDedupe(redis: FakeRedis, ttlSeconds = POLLER_DEDUPE_TTL_SECONDS): Promise<NonceStore> {
    const store = new NonceStore(redis as never, {
        ttlSeconds,
        keyPrefix: POLLER_DEDUPE_KEY_PREFIX
    });
    await store.initialize();
    return store;
}

describe('integrationPoller persistent deduplication', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        stopIntegrationPoller();
        setPollerDedupeForTests(null);
    });

    afterEach(() => {
        stopIntegrationPoller();
        setPollerDedupeForTests(null);
        vi.useRealTimers();
    });

    it('uses 30-day TTL and apollo:poller: prefix', () => {
        expect(POLLER_DEDUPE_TTL_SECONDS).toBe(2592000);
        expect(POLLER_DEDUPE_KEY_PREFIX).toBe('apollo:poller:');
        expect(buildYoutubeNonce('sub1', 'vid1')).toBe('youtube:sub1:vid1');
        expect(buildRssNonce('sub1', 'item1')).toBe('rss:sub1:item1');
        expect(buildTwitchNonce('sub1', 'stream1')).toBe('twitch:sub1:stream1');
    });

    it('notifies a youtube video once across consecutive polls via Redis', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckYoutube.mockResolvedValue([{
            title: 'Video',
            description: 'desc',
            thumbnail: 'thumb',
            videoId: 'v1',
            publishedAt: new Date().toISOString()
        }] as never);

        const fake = new FakeRedis();
        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));

        await pollYoutubeSubscriptions();
        await pollYoutubeSubscriptions();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('survives pod restart: new NonceStore over same Redis backend still dedupes', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckYoutube.mockResolvedValue([{
            title: 'Video',
            description: 'desc',
            thumbnail: 'thumb',
            videoId: 'v1',
            publishedAt: new Date().toISOString()
        }] as never);

        const fake = new FakeRedis();

        const first = createMockClient();
        initIntegrationPoller(first.client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));
        await pollYoutubeSubscriptions();
        expect(first.send).toHaveBeenCalledTimes(1);

        stopIntegrationPoller();
        setPollerDedupeForTests(null);

        const second = createMockClient();
        initIntegrationPoller(second.client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));
        await pollYoutubeSubscriptions();
        expect(second.send).not.toHaveBeenCalled();
    });

    it('does not collide across different subIds and videoIds', async () => {
        const fake = new FakeRedis();
        const store = await makeDedupe(fake);

        expect(await store.checkAndSet(buildYoutubeNonce('a', 'v1'), 0)).toBe(true);
        expect(await store.checkAndSet(buildYoutubeNonce('a', 'v1'), 0)).toBe(false);
        expect(await store.checkAndSet(buildYoutubeNonce('b', 'v1'), 0)).toBe(true);
        expect(await store.checkAndSet(buildYoutubeNonce('a', 'v2'), 0)).toBe(true);
        expect(await store.checkAndSet(buildRssNonce('a', 'v1'), 0)).toBe(true);
        expect(await store.checkAndSet(buildTwitchNonce('a', 'v1'), 0)).toBe(true);
    });

    it('notifies two youtube subscriptions with distinct videos independently', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'yt1', type: 'youtube', target_id: 'chanA', channel_id: 'c1' },
            { id: 'yt2', type: 'youtube', target_id: 'chanB', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckYoutube.mockImplementation(((channelId: string) => Promise.resolve([{
            title: `Video ${channelId}`,
            description: 'desc',
            thumbnail: 'thumb',
            videoId: `video-${channelId}`,
            publishedAt: new Date().toISOString()
        }])) as never);

        const fake = new FakeRedis();
        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));

        await pollYoutubeSubscriptions();

        expect(send).toHaveBeenCalledTimes(2);

        await pollYoutubeSubscriptions();
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('writes Redis keys with apollo:poller: prefix for youtube items', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckYoutube.mockResolvedValue([{
            title: 'Video',
            description: 'desc',
            thumbnail: 'thumb',
            videoId: 'v9',
            publishedAt: new Date().toISOString()
        }] as never);

        const fake = new FakeRedis();
        const { client } = createMockClient();
        initIntegrationPoller(client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));

        await pollYoutubeSubscriptions();

        const allKeys = [...fake.evalCalls, ...fake.evalshaCalls].map((c) => String(c[2]));
        expect(allKeys.some((k) => k === 'apollo:poller:youtube:yt1:v9:0')).toBe(true);
    });

    it('allows re-processing after TTL expiration', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const fake = new FakeRedis();
        const store = await makeDedupe(fake, 2);

        expect(await store.checkAndSet('youtube:sub1:vid1', 0)).toBe(true);
        expect(await store.checkAndSet('youtube:sub1:vid1', 0)).toBe(false);

        vi.setSystemTime(new Date('2026-01-01T00:00:03Z'));
        expect(await store.checkAndSet('youtube:sub1:vid1', 0)).toBe(true);
    });

    it('dedupes twitch live notifications and re-notifies on title change', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'tw1', type: 'twitch', target_id: 'streamer', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckTwitch.mockResolvedValue({ live: true, title: 'Playing' } as never);

        const fake = new FakeRedis();
        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));

        await pollTwitchSubscriptions();
        await pollTwitchSubscriptions();
        expect(send).toHaveBeenCalledTimes(1);

        mockCheckTwitch.mockResolvedValue({ live: true, title: 'New Title' } as never);
        await pollTwitchSubscriptions();
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('dedupes rss items across consecutive polls via Redis', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'rss1', type: 'rss', target_id: 'https://example.com/feed', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckRss.mockResolvedValue({
            feedTitle: 'Feed',
            items: [{ title: 'Item', link: 'https://example.com/1', guid: 'r1', pubDate: new Date().toISOString() }]
        } as never);

        const fake = new FakeRedis();
        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);
        setPollerDedupeForTests(await makeDedupe(fake));

        await pollRssSubscriptions();
        await pollRssSubscriptions();

        expect(send).toHaveBeenCalledTimes(1);

        const allKeys = [...fake.evalCalls, ...fake.evalshaCalls].map((c) => String(c[2]));
        expect(allKeys.some((k) => k === 'apollo:poller:rss:rss1:r1:0')).toBe(true);
    });

    it('falls back to in-memory dedupe when Redis is unavailable', async () => {
        mockGetData.mockResolvedValue(createStore([
            { id: 'yt1', type: 'youtube', target_id: 'channel', channel_id: 'c1' }
        ]) as never);
        mockSetData.mockResolvedValue(undefined as never);
        mockCheckYoutube.mockResolvedValue([{
            title: 'Video',
            description: 'desc',
            thumbnail: 'thumb',
            videoId: 'v1',
            publishedAt: new Date().toISOString()
        }] as never);

        const { getLockRedis } = await import('../../src/utils/lock.js');
        vi.mocked(getLockRedis).mockResolvedValue(null);

        const { client, send } = createMockClient();
        initIntegrationPoller(client, pollerConfig);
        setPollerDedupeForTests(null);

        await pollYoutubeSubscriptions();
        await pollYoutubeSubscriptions();

        expect(send).toHaveBeenCalledTimes(1);
    });
});
