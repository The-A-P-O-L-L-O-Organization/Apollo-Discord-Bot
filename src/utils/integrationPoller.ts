// Integration Poller
// Periodically polls Twitch, YouTube, and RSS feeds for new content
// @ts-expect-error - lock.js not yet migrated
import { withLock, getLockRedis } from './lock.js';
import { checkTwitchStream, checkYoutubeUploads, checkRssFeed } from './integrationClients.js';
import { formatTwitchNotification, formatYoutubeNotification, formatRssNotification } from './integrationFormatters.js';
import type { Client } from '../types/shared.js';
import type { TextChannel } from 'discord.js';

interface IntegrationConfig {
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

export function initIntegrationPoller(discordClient: Client, cfg: { integrations: IntegrationConfig }): void {
    client = discordClient;
    integrationConfig = cfg.integrations;

    const pollers = [
        { type: 'twitch' as const, interval: integrationConfig.pollInterval.twitch, check: pollTwitchSubscriptions },
        { type: 'youtube' as const, interval: integrationConfig.pollInterval.youtube, check: pollYoutubeSubscriptions },
        { type: 'rss' as const, interval: integrationConfig.pollInterval.rss, check: pollRssSubscriptions }
    ];

    for (const p of pollers) {
        if (p.interval <= 0) { continue; }
        const id = setInterval(async () => {
            const redis = await getLockRedis();
            if (redis) {
                await withLock(redis, `poller:${p.type}`, 'integrations', async () => {
                    await p.check();
                }, 60000);
            } else {
                await p.check();
            }
        }, p.interval);
        intervals.push(id);
    }

    startupTimeout ??= setTimeout(async () => {
        startupTimeout = null;
        await loadKnownItems();
        await pollYoutubeSubscriptions();
        await pollRssSubscriptions();
    }, 5000);
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
    client = null;
    integrationConfig = null;
}

async function getSubs(): Promise<Subscription[]> {
    const { getData } = await import('./db.js');
    const data = await getData('integrations') as Record<string, unknown> | undefined;
    return (data?.['subscriptions'] as Subscription[]) || [];
}

async function updateSub(subId: string, updates: Partial<Subscription>): Promise<void> {
    const { getData, setData } = await import('./db.js');
    const data = await getData('integrations') as Record<string, unknown> | undefined;
    if (!data?.['subscriptions']) { return; }
    const subscriptions = data['subscriptions'] as Subscription[];
    const idx = subscriptions.findIndex((s: Subscription) => s.id === subId);
    if (idx === -1) { return; }
    subscriptions[idx] = { ...subscriptions[idx], ...updates } as Subscription;
    data['subscriptions'] = subscriptions;
    await setData('integrations', data);
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

async function pollTwitchSubscriptions(): Promise<void> {
    if (!client || !integrationConfig?.twitchClientId) { return; }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'twitch');
        for (const sub of subs) {
            const streamData = await checkTwitchStream(sub.target_id, integrationConfig);
            if (streamData && streamData.live) {
                const channel = client.channels.cache.get(sub.channel_id);
                if (channel?.isTextBased()) {
                    const notification = formatTwitchNotification(sub.target_id, streamData);
                    if (notification) {
                        (channel as TextChannel).send(notification).catch(() => {});
                    }
                }
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            } else if (streamData && !streamData.live) {
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

async function pollYoutubeSubscriptions(): Promise<void> {
    if (!client || !integrationConfig?.youtubeApiKey) { return; }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'youtube');
        for (const sub of subs) {
            const videos = await checkYoutubeUploads(sub.target_id, integrationConfig);
            if (!videos || videos.length === 0) { continue; }

            const seen = knownItems.get(`youtube:${sub.id}`) ?? new Set();
            let posted = false;

            for (const video of videos) {
                if (!seen.has(video.videoId)) {
                    const channel = client.channels.cache.get(sub.channel_id);
                    if (channel?.isTextBased()) {
                        const notification = formatYoutubeNotification(sub.target_id, video);
                        if (notification) {
                            (channel as TextChannel).send(notification).catch(() => {});
                        }
                    }
                    seen.add(video.videoId);
                    posted = true;
                    break;
                }
            }

            knownItems.set(`youtube:${sub.id}`, seen);
            if (posted) {
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

async function pollRssSubscriptions(): Promise<void> {
    if (!client) { return; }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'rss');
        for (const sub of subs) {
            const feed = await checkRssFeed(sub.target_id);
            if (!feed || feed.items.length === 0) { continue; }

            const seen = knownItems.get(`rss:${sub.id}`) ?? new Set();
            let posted = false;

            for (const item of feed.items) {
                const key = item.guid || item.link;
                if (!seen.has(key)) {
                    const channel = client.channels.cache.get(sub.channel_id);
                    if (channel?.isTextBased()) {
                        const notification = formatRssNotification(feed.feedTitle, item);
                        if (notification) {
                            (channel as TextChannel).send(notification).catch(() => {});
                        }
                    }
                    seen.add(key);
                    posted = true;
                    break;
                }
            }

            knownItems.set(`rss:${sub.id}`, seen);
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