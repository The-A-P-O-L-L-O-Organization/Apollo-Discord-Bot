// Integration Poller
// Periodically polls Twitch, YouTube, and RSS feeds for new content
import { withLock, getLockRedis } from './lock.js';
import { getData, setData } from './db.js';
import { NonceStore } from '../queue/nonceStore.js';
import { checkTwitchStream, checkYoutubeUploads, checkRssFeed } from './integrationClients.js';
import { formatTwitchNotification, formatYoutubeNotification, formatRssNotification } from './integrationFormatters.js';
import type { Client } from '../types/shared.js';
import type { TextChannel } from 'discord.js';

export interface IntegrationConfig {
    twitchClientId: string;
    twitchClientSecret: string;
    youtubeApiKey: string;
    pollInterval: {
        twitch: number;
        youtube: number;
        rss: number;
    };
}

interface Subscription {
    id: string;
    type: 'twitch' | 'youtube' | 'rss';
    target_id: string;
    channel_id: string;
    last_checked?: string;
}

let client: Client | null = null;
let integrationConfig: IntegrationConfig | null = null;
let intervals: NodeJS.Timeout[] = [];
const knownItems = new Map<string, Set<string>>();
let startupTimeout: NodeJS.Timeout | null = null;

export const POLLER_DEDUPE_TTL_SECONDS = 2592000;
export const POLLER_DEDUPE_KEY_PREFIX = 'apollo:poller:';
const POLLER_NONCE_TIMESTAMP = 0;
let pollerDedupe: NonceStore | null = null;

export async function initializePollerDedupe(): Promise<NonceStore | null> {
    if (pollerDedupe) {
        return pollerDedupe;
    }
    const redis = await getLockRedis();
    if (!redis) {
        return null;
    }
    pollerDedupe = new NonceStore(redis, {
        ttlSeconds: POLLER_DEDUPE_TTL_SECONDS,
        keyPrefix: POLLER_DEDUPE_KEY_PREFIX
    });
    await pollerDedupe.initialize();
    return pollerDedupe;
}

export function getPollerDedupe(): NonceStore | null {
    return pollerDedupe;
}

export function setPollerDedupeForTests(store: NonceStore | null): void {
    pollerDedupe = store;
}

export async function closePollerDedupe(): Promise<void> {
    pollerDedupe = null;
}

export function buildYoutubeNonce(subId: string, videoId: string): string {
    return `youtube:${subId}:${videoId}`;
}

export function buildRssNonce(subId: string, itemId: string): string {
    return `rss:${subId}:${itemId}`;
}

export function buildTwitchNonce(subId: string, streamId: string): string {
    return `twitch:${subId}:${streamId}`;
}

async function ensurePollerDedupe(): Promise<NonceStore | null> {
    if (pollerDedupe) {
        return pollerDedupe;
    }
    try {
        return await initializePollerDedupe();
    } catch {
        return null;
    }
}

async function isPollerDuplicate(mapKey: string, nonce: string, itemId: string): Promise<boolean> {
    const dedupe = await ensurePollerDedupe();
    if (dedupe) {
        let claimed: boolean | null = null;
        try {
            claimed = await dedupe.checkAndSet(nonce, POLLER_NONCE_TIMESTAMP);
        } catch {
            claimed = null;
        }
        if (claimed !== null) {
            let set = knownItems.get(mapKey);
            if (!set) {
                set = new Set();
                knownItems.set(mapKey, set);
            }
            set.add(itemId);
            return !claimed;
        }
    }
    let set = knownItems.get(mapKey);
    if (!set) {
        set = new Set();
        knownItems.set(mapKey, set);
    }
    if (set.has(itemId)) {
        return true;
    }
    set.add(itemId);
    return false;
}

export function initIntegrationPoller(discordClient: Client, cfg: { integrations: IntegrationConfig }): void {
    client = discordClient;
    integrationConfig = cfg.integrations;

    if (!integrationConfig?.pollInterval) {
        return;
    }

    const pollers = [
        { type: 'twitch' as const, interval: integrationConfig.pollInterval.twitch, check: pollTwitchSubscriptions },
        { type: 'youtube' as const, interval: integrationConfig.pollInterval.youtube, check: pollYoutubeSubscriptions },
        { type: 'rss' as const, interval: integrationConfig.pollInterval.rss, check: pollRssSubscriptions }
    ];

    for (const p of pollers) {
        if (p.interval <= 0) { continue; }
        const id = setInterval(() => { void (async () => {
            const redis = await getLockRedis();
            if (redis) {
                await withLock(redis, `poller:${p.type}`, 'integrations', async () => {
                    await p.check();
                }, 60000);
            } else {
                await p.check();
            }
        })(); }, p.interval);
        intervals.push(id);
    }

    startupTimeout ??= setTimeout(() => { void (async () => {
        startupTimeout = null;
        await loadKnownItems();
        await pollYoutubeSubscriptions();
        await pollRssSubscriptions();
    })(); }, 5000);
}

export function stopIntegrationPoller(): void {
    for (const id of intervals) {
        clearInterval(id);
    }
    intervals = [];
    if (startupTimeout) {
        clearTimeout(startupTimeout);
        startupTimeout = null;
    }
    knownItems.clear();
    pollerDedupe = null;
    client = null;
    integrationConfig = null;
}

let dbWriteQueue: Promise<void> = Promise.resolve();

async function withDbWriteMutex<T>(fn: () => Promise<T>): Promise<T> {
    const previous = dbWriteQueue;
    let release: () => void = () => undefined;
    dbWriteQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
        return await fn();
    } finally {
        release();
    }
}

async function getSubs(): Promise<Subscription[]> {
    const data = await getData('integrations') as Record<string, unknown> | undefined;
    return (data?.['subscriptions'] as Subscription[]) || [];
}

async function updateSub(subId: string, updates: Partial<Subscription>): Promise<void> {
    await withDbWriteMutex(async () => {
        const data = await getData('integrations') as Record<string, unknown> | undefined;
        if (!data?.['subscriptions']) { return; }
        const subscriptions = data['subscriptions'] as Subscription[];
        const idx = subscriptions.findIndex((s: Subscription) => s.id === subId);
        if (idx === -1) { return; }
        subscriptions[idx] = { ...subscriptions[idx], ...updates } as Subscription;
        data['subscriptions'] = subscriptions;
        await setData('integrations', data);
    });
}

async function loadKnownItems(): Promise<void> {
    const subs = await getSubs();
    for (const sub of subs) {
        if (sub.type === 'youtube' || sub.type === 'rss') {
            const key = `${sub.type}:${sub.id}`;
            if (!knownItems.has(key)) { knownItems.set(key, new Set()); }
        }
    }
}

export async function pollTwitchSubscriptions(): Promise<void> {
    if (!client || !integrationConfig?.twitchClientId) { return; }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'twitch');
        for (const sub of subs) {
            const streamData = await checkTwitchStream(sub.target_id, integrationConfig);
            if (streamData?.live) {
                const streamId = streamData.title ?? 'live';
                const nonce = buildTwitchNonce(sub.id, streamId);
                if (await isPollerDuplicate(`twitch:${sub.id}`, nonce, streamId)) {
                    await updateSub(sub.id, { last_checked: new Date().toISOString() });
                    continue;
                }
                const channel = client.channels.cache.get(sub.channel_id);
                if (channel?.isTextBased()) {
                    const notification = formatTwitchNotification(sub.target_id, streamData);
                    if (notification) {
                        (channel as TextChannel).send(notification).catch(() => undefined);
                    }
                }
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            } else if (streamData && !streamData.live) {
                knownItems.delete(`twitch:${sub.id}`);
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

export async function pollYoutubeSubscriptions(): Promise<void> {
    if (!client || !integrationConfig?.youtubeApiKey) { return; }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'youtube');
        for (const sub of subs) {
            const videos = await checkYoutubeUploads(sub.target_id, integrationConfig);
            if (!videos || videos.length === 0) { continue; }

            let posted = false;

            for (const video of videos) {
                const nonce = buildYoutubeNonce(sub.id, video.videoId);
                if (await isPollerDuplicate(`youtube:${sub.id}`, nonce, video.videoId)) {
                    continue;
                }
                    const channel = client.channels.cache.get(sub.channel_id);
                    if (channel?.isTextBased()) {
                        const notification = formatYoutubeNotification(sub.target_id, video);
                        if (notification) {
                            (channel as TextChannel).send(notification).catch(() => undefined);
                        }
                    }
                    posted = true;
                    break;
            }

            if (posted) {
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

export async function pollRssSubscriptions(): Promise<void> {
    if (!client) { return; }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'rss');
        for (const sub of subs) {
            const feed = await checkRssFeed(sub.target_id);
            if (!feed || feed.items.length === 0) { continue; }

            let posted = false;

            for (const item of feed.items) {
                const key = item.guid || item.link;
                const nonce = buildRssNonce(sub.id, key);
                if (await isPollerDuplicate(`rss:${sub.id}`, nonce, key)) {
                    continue;
                }
                const channel = client.channels.cache.get(sub.channel_id);
                if (channel?.isTextBased()) {
                    const notification = formatRssNotification(feed.feedTitle, item);
                    if (notification) {
                        (channel as TextChannel).send(notification).catch(() => undefined);
                    }
                }
                posted = true;
                break;
            }

            if (posted) {
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

export default {
    initIntegrationPoller,
    stopIntegrationPoller
};