// Integration Poller
// Periodically polls Twitch, YouTube, and RSS feeds for new content
import { withLock, getLockRedis } from './lock.js';
import { getData, setData } from './db.js';
import { NonceStore } from '../queue/nonceStore.js';
import { checkTwitchStream, checkYoutubeUploads, checkRssFeed } from './integrationClients.js';
import { formatTwitchNotification, formatYoutubeNotification, formatRssNotification } from './integrationFormatters.js';
import { createLocalLimiter, type LocalLimiter } from './localConcurrency.js';
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
    pollConcurrency?: {
        twitch?: number;
        youtube?: number;
        rss?: number;
    };
}

interface Subscription {
    id: string;
    type: 'twitch' | 'youtube' | 'rss';
    target_id: string;
    channel_id: string;
    last_checked?: string;
}

type PollerType = 'twitch' | 'youtube' | 'rss';

interface PollerLimiters {
    twitch: LocalLimiter;
    youtube: LocalLimiter;
    rss: LocalLimiter;
}

interface PollerContext {
    generation: number;
    client: Client;
    config: IntegrationConfig;
    knownItems: Map<string, Set<string>>;
    dedupe: NonceStore | null;
    limiters: PollerLimiters;
    writeBarrier: Promise<void>;
}

let client: Client | null = null;
let integrationConfig: IntegrationConfig | null = null;
let intervals: NodeJS.Timeout[] = [];
let knownItems = new Map<string, Set<string>>();
let startupTimeout: NodeJS.Timeout | null = null;
let pollerLimiters: PollerLimiters | null = null;
let pollerGeneration = 0;

const DEFAULT_POLL_CONCURRENCY = 4;

export const POLLER_DEDUPE_TTL_SECONDS = 2592000;
export const POLLER_DEDUPE_KEY_PREFIX = 'apollo:poller:';
const POLLER_NONCE_TIMESTAMP = 0;
let pollerDedupe: NonceStore | null = null;

export async function initializePollerDedupe(): Promise<NonceStore | null> {
    const generation = pollerGeneration;
    if (pollerDedupe) {
        return pollerDedupe;
    }
    const redis = await getLockRedis();
    if (!redis || generation !== pollerGeneration) {
        return null;
    }
    const dedupe = new NonceStore(redis, {
        ttlSeconds: POLLER_DEDUPE_TTL_SECONDS,
        keyPrefix: POLLER_DEDUPE_KEY_PREFIX
    });
    await dedupe.initialize();
    if (generation !== pollerGeneration) {
        return null;
    }
    pollerDedupe = dedupe;
    return dedupe;
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

async function ensurePollerDedupe(context: PollerContext): Promise<NonceStore | null> {
    if (context.dedupe) {
        return context.dedupe;
    }
    if (!isCurrentPoller(context)) {
        return null;
    }
    if (pollerDedupe) {
        context.dedupe = pollerDedupe;
        return pollerDedupe;
    }
    try {
        const redis = await getLockRedis();
        if (!redis || !isCurrentPoller(context)) {
            return null;
        }
        const dedupe = new NonceStore(redis, {
            ttlSeconds: POLLER_DEDUPE_TTL_SECONDS,
            keyPrefix: POLLER_DEDUPE_KEY_PREFIX
        });
        await dedupe.initialize();
        if (!isCurrentPoller(context)) {
            return null;
        }
        context.dedupe = dedupe;
        pollerDedupe = dedupe;
        return dedupe;
    } catch {
        return null;
    }
}

async function isPollerDuplicate(context: PollerContext, mapKey: string, nonce: string, itemId: string): Promise<boolean | null> {
    const dedupe = await ensurePollerDedupe(context);
    if (!isCurrentPoller(context)) {
        return null;
    }
    if (dedupe) {
        let claimed: boolean | null = null;
        try {
            claimed = await dedupe.checkAndSet(nonce, POLLER_NONCE_TIMESTAMP);
        } catch {
            claimed = null;
        }
        if (!isCurrentPoller(context)) {
            return null;
        }
        if (claimed !== null) {
            let set = context.knownItems.get(mapKey);
            if (!set) {
                set = new Set();
                context.knownItems.set(mapKey, set);
            }
            set.add(itemId);
            return !claimed;
        }
    }
    if (!isCurrentPoller(context)) {
        return null;
    }
    let set = context.knownItems.get(mapKey);
    if (!set) {
        set = new Set();
        context.knownItems.set(mapKey, set);
    }
    if (set.has(itemId)) {
        return true;
    }
    set.add(itemId);
    return false;
}

export function initIntegrationPoller(discordClient: Client, cfg: { integrations: IntegrationConfig }): void {
    stopIntegrationPoller();
    pollerGeneration += 1;
    client = discordClient;
    integrationConfig = cfg.integrations;
    knownItems = new Map();
    pollerLimiters = {
        twitch: createLocalLimiter('twitch', integrationConfig.pollConcurrency?.twitch ?? DEFAULT_POLL_CONCURRENCY),
        youtube: createLocalLimiter('youtube', integrationConfig.pollConcurrency?.youtube ?? DEFAULT_POLL_CONCURRENCY),
        rss: createLocalLimiter('rss', integrationConfig.pollConcurrency?.rss ?? DEFAULT_POLL_CONCURRENCY)
    };

    if (!integrationConfig?.pollInterval) {
        return;
    }

    const pollers = [
        { type: 'twitch' as const, interval: integrationConfig.pollInterval.twitch },
        { type: 'youtube' as const, interval: integrationConfig.pollInterval.youtube },
        { type: 'rss' as const, interval: integrationConfig.pollInterval.rss }
    ];
    const generation = pollerGeneration;

    for (const p of pollers) {
        if (p.interval <= 0) { continue; }
        const id = setInterval(() => {
            void runScheduledPoll(generation, p.type);
        }, p.interval);
        intervals.push(id);
    }

    startupTimeout ??= setTimeout(() => { void (async () => {
        if (generation !== pollerGeneration) { return; }
        startupTimeout = null;
        await runStartupPoll(generation);
    })(); }, 5000);
}

export function stopIntegrationPoller(): void {
    pollerWriteBarrier = dbWriteQueue;
    pollerGeneration += 1;
    for (const id of intervals) {
        clearInterval(id);
    }
    intervals = [];
    if (startupTimeout) {
        clearTimeout(startupTimeout);
        startupTimeout = null;
    }
    knownItems.clear();
    knownItems = new Map();
    pollerLimiters?.twitch.shutdown();
    pollerLimiters?.youtube.shutdown();
    pollerLimiters?.rss.shutdown();
    pollerLimiters = null;
    pollerDedupe = null;
    client = null;
    integrationConfig = null;
}

let dbWriteQueue: Promise<void> = Promise.resolve();
let pollerWriteBarrier: Promise<void> = dbWriteQueue;

async function withDbWriteMutex<T>(generation: number, fn: () => Promise<T>): Promise<T | undefined> {
    const previous = dbWriteQueue;
    let release: () => void = () => undefined;
    dbWriteQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
        if (generation !== pollerGeneration) {
            return undefined;
        }
        return await fn();
    } finally {
        release();
    }
}

async function getSubs(): Promise<Subscription[]> {
    const data = await getData('integrations') as Record<string, unknown> | undefined;
    return (data?.['subscriptions'] as Subscription[]) || [];
}

async function updateSub(context: PollerContext, subId: string, updates: Partial<Subscription>): Promise<void> {
    await withDbWriteMutex(context.generation, async () => {
        if (!isCurrentPoller(context)) {
            return;
        }
        const data = await getData('integrations') as Record<string, unknown> | undefined;
        if (!isCurrentPoller(context)) {
            return;
        }
        if (!data?.['subscriptions']) { return; }
        const subscriptions = data['subscriptions'] as Subscription[];
        const idx = subscriptions.findIndex((s: Subscription) => s.id === subId);
        if (idx === -1) { return; }
        if (!isCurrentPoller(context)) {
            return;
        }
        subscriptions[idx] = { ...subscriptions[idx], ...updates } as Subscription;
        data['subscriptions'] = subscriptions;
        await setData('integrations', data);
    });
}

async function loadKnownItems(context: PollerContext): Promise<void> {
    const subs = await getSubs();
    if (!isCurrentPoller(context)) {
        return;
    }
    for (const sub of subs) {
        if (sub.type === 'youtube' || sub.type === 'rss') {
            const key = `${sub.type}:${sub.id}`;
            if (!context.knownItems.has(key)) { context.knownItems.set(key, new Set()); }
        }
    }
}

async function runScheduledPoll(generation: number, type: PollerType): Promise<void> {
    const context = getPollerContext(generation);
    if (!context) {
        return;
    }
    if (!await waitForPollerWriteBarrier(context)) {
        return;
    }
    const redis = await getLockRedis();
    if (!isCurrentPoller(context)) {
        return;
    }
    if (redis) {
        await withLock(redis, `poller:${type}`, 'integrations', async () => {
            if (!isCurrentPoller(context)) {
                return;
            }
            await runPoller(type, context);
        }, 60000);
        return;
    }
    await runPoller(type, context);
}

async function runStartupPoll(generation: number): Promise<void> {
    const context = getPollerContext(generation);
    if (!context) {
        return;
    }
    if (!await waitForPollerWriteBarrier(context)) {
        return;
    }
    await loadKnownItems(context);
    if (!isCurrentPoller(context)) {
        return;
    }
    await pollYoutubeSubscriptionsForContext(context);
    if (!isCurrentPoller(context)) {
        return;
    }
    await pollRssSubscriptionsForContext(context);
}

export async function pollTwitchSubscriptions(): Promise<void> {
    const context = getPollerContext();
    if (!context?.config.twitchClientId) { return; }
    await pollTwitchSubscriptionsForContext(context);
}

async function pollTwitchSubscriptionsForContext(context: PollerContext): Promise<void> {
    if (!isCurrentPoller(context)) {
        return;
    }
    if (!await waitForPollerWriteBarrier(context)) {
        return;
    }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'twitch');
        if (!isCurrentPoller(context)) {
            return;
        }
        const results = await Promise.all(subs.map((sub) => context.limiters.twitch.run(async() => {
            if (!isCurrentPoller(context)) {
                return null;
            }
            try {
                return { sub, streamData: await checkTwitchStream(sub.target_id, context.config) };
            } catch {
                return null;
            }
        })));
        if (!isCurrentPoller(context)) {
            return;
        }
        for (const result of results) {
            if (!isCurrentPoller(context)) {
                return;
            }
            if (!result) { continue; }
            try {
                const { sub, streamData } = result;
                if (streamData?.live) {
                    const streamId = streamData.title ?? 'live';
                    const nonce = buildTwitchNonce(sub.id, streamId);
                    const duplicate = await isPollerDuplicate(context, `twitch:${sub.id}`, nonce, streamId);
                    if (duplicate === null) {
                        return;
                    }
                    if (duplicate) {
                        await updateSub(context, sub.id, { last_checked: new Date().toISOString() });
                        continue;
                    }
                    if (!isCurrentPoller(context)) {
                        return;
                    }
                    const channel = context.client.channels.cache.get(sub.channel_id);
                    if (channel?.isTextBased()) {
                        const notification = formatTwitchNotification(sub.target_id, streamData);
                        if (notification) {
                            (channel as TextChannel).send(notification).catch(() => undefined);
                        }
                    }
                    await updateSub(context, sub.id, { last_checked: new Date().toISOString() });
                } else if (streamData && !streamData.live) {
                    if (!isCurrentPoller(context)) {
                        return;
                    }
                    context.knownItems.delete(`twitch:${sub.id}`);
                    await updateSub(context, sub.id, { last_checked: new Date().toISOString() });
                }
            } catch {
                // silently ignore api/channel errors for this subscription
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

export async function pollYoutubeSubscriptions(): Promise<void> {
    const context = getPollerContext();
    if (!context?.config.youtubeApiKey) { return; }
    await pollYoutubeSubscriptionsForContext(context);
}

async function pollYoutubeSubscriptionsForContext(context: PollerContext): Promise<void> {
    if (!isCurrentPoller(context)) {
        return;
    }
    if (!await waitForPollerWriteBarrier(context)) {
        return;
    }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'youtube');
        if (!isCurrentPoller(context)) {
            return;
        }
        const results = await Promise.all(subs.map((sub) => context.limiters.youtube.run(async() => {
            if (!isCurrentPoller(context)) {
                return null;
            }
            try {
                return { sub, videos: await checkYoutubeUploads(sub.target_id, context.config) };
            } catch {
                return null;
            }
        })));
        if (!isCurrentPoller(context)) {
            return;
        }
        for (const result of results) {
            if (!isCurrentPoller(context)) {
                return;
            }
            if (!result) { continue; }
            try {
                const { sub, videos } = result;
                if (!videos || videos.length === 0) { continue; }
                let posted = false;

                for (const video of videos) {
                    const nonce = buildYoutubeNonce(sub.id, video.videoId);
                    const duplicate = await isPollerDuplicate(context, `youtube:${sub.id}`, nonce, video.videoId);
                    if (duplicate === null) {
                        return;
                    }
                    if (duplicate) {
                        continue;
                    }
                    if (!isCurrentPoller(context)) {
                        return;
                    }
                    const channel = context.client.channels.cache.get(sub.channel_id);
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
                    await updateSub(context, sub.id, { last_checked: new Date().toISOString() });
                }
            } catch {
                // silently ignore api/channel errors for this subscription
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

export async function pollRssSubscriptions(): Promise<void> {
    const context = getPollerContext();
    if (!context) { return; }
    await pollRssSubscriptionsForContext(context);
}

async function pollRssSubscriptionsForContext(context: PollerContext): Promise<void> {
    if (!isCurrentPoller(context)) {
        return;
    }
    if (!await waitForPollerWriteBarrier(context)) {
        return;
    }

    try {
        const subs = (await getSubs()).filter((s: Subscription) => s.type === 'rss');
        if (!isCurrentPoller(context)) {
            return;
        }
        const results = await Promise.all(subs.map((sub) => context.limiters.rss.run(async() => {
            if (!isCurrentPoller(context)) {
                return null;
            }
            try {
                return { sub, feed: await checkRssFeed(sub.target_id) };
            } catch {
                return null;
            }
        })));
        if (!isCurrentPoller(context)) {
            return;
        }
        for (const result of results) {
            if (!isCurrentPoller(context)) {
                return;
            }
            if (!result) { continue; }
            try {
                const { sub, feed } = result;
                if (!feed || feed.items.length === 0) { continue; }
                let posted = false;

                for (const item of feed.items) {
                    const key = item.guid || item.link;
                    const nonce = buildRssNonce(sub.id, key);
                    const duplicate = await isPollerDuplicate(context, `rss:${sub.id}`, nonce, key);
                    if (duplicate === null) {
                        return;
                    }
                    if (duplicate) {
                        continue;
                    }
                    if (!isCurrentPoller(context)) {
                        return;
                    }
                    const channel = context.client.channels.cache.get(sub.channel_id);
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
                    await updateSub(context, sub.id, { last_checked: new Date().toISOString() });
                }
            } catch {
                // silently ignore api/channel errors for this subscription
            }
        }
    } catch {
        // silently ignore api/channel errors
    }
}

async function runPoller(type: PollerType, context: PollerContext): Promise<void> {
    if (type === 'twitch') {
        await pollTwitchSubscriptionsForContext(context);
        return;
    }
    if (type === 'youtube') {
        await pollYoutubeSubscriptionsForContext(context);
        return;
    }
    await pollRssSubscriptionsForContext(context);
}

function getPollerContext(generation = pollerGeneration): PollerContext | null {
    const currentClient = client;
    const config = integrationConfig;
    const limiters = pollerLimiters;
    if (generation !== pollerGeneration || !currentClient || !config || !limiters) {
        return null;
    }
    return {
        generation,
        client: currentClient,
        config,
        knownItems,
        dedupe: pollerDedupe,
        limiters,
        writeBarrier: pollerWriteBarrier
    };
}

function isCurrentPoller(context: PollerContext): boolean {
    return context.generation === pollerGeneration
        && client === context.client
        && integrationConfig === context.config;
}

async function waitForPollerWriteBarrier(context: PollerContext): Promise<boolean> {
    await context.writeBarrier;
    return isCurrentPoller(context);
}

export default {
    initIntegrationPoller,
    stopIntegrationPoller
};