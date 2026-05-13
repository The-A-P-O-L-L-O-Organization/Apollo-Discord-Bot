import { withLock, getLockRedis } from './lock.js';
import { checkTwitchStream, checkYoutubeUploads, checkRssFeed } from './integrationClients.js';
import { formatTwitchNotification, formatYoutubeNotification, formatRssNotification } from './integrationFormatters.js';

let client = null;
let integrationConfig = null;
let intervals = [];
const knownItems = new Map();
let startupTimeout = null;

export function initIntegrationPoller(discordClient, cfg) {
    client = discordClient;
    integrationConfig = cfg.integrations;

    const pollers = [
        { type: 'twitch', interval: integrationConfig.pollInterval.twitch, check: pollTwitchSubscriptions },
        { type: 'youtube', interval: integrationConfig.pollInterval.youtube, check: pollYoutubeSubscriptions },
        { type: 'rss', interval: integrationConfig.pollInterval.rss, check: pollRssSubscriptions }
    ];

    for (const p of pollers) {
        if (p.interval <= 0) {continue;}
        const id = setInterval(async() => {
            const redis = await getLockRedis();
            if (redis) {
                await withLock(redis, `poller:${p.type}`, 'integrations', async() => {
                    await p.check();
                }, 60000);
            } else {
                await p.check();
            }
        }, p.interval);
        intervals.push(id);
    }

    if (!startupTimeout) {
        startupTimeout = setTimeout(async() => {
            startupTimeout = null;
            await loadKnownItems();
            await pollYoutubeSubscriptions();
            await pollRssSubscriptions();
        }, 5000);
    }
}

export function stopIntegrationPoller() {
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

async function getSubs() {
    const { getData } = await import('./db.js');
    const data = await getData('integrations');
    return data?.subscriptions || [];
}

async function updateSub(subId, updates) {
    const { getData, setData } = await import('./db.js');
    const data = await getData('integrations');
    if (!data?.subscriptions) {return;}
    const idx = data.subscriptions.findIndex(s => s.id === subId);
    if (idx === -1) {return;}
    data.subscriptions[idx] = { ...data.subscriptions[idx], ...updates };
    await setData('integrations', data);
}

async function loadKnownItems() {
    const subs = await getSubs();
    for (const sub of subs) {
        if (sub.type === 'youtube' || sub.type === 'rss') {
            const key = `${sub.type}:${sub.id}`;
            if (!knownItems.has(key)) {knownItems.set(key, new Set());}
        }
    }
}

async function pollTwitchSubscriptions() {
    if (!client || !integrationConfig.twitchClientId) {return;}

    try {
        const subs = (await getSubs()).filter(s => s.type === 'twitch');
        for (const sub of subs) {
            const streamData = await checkTwitchStream(sub.target_id, integrationConfig);
            if (streamData && streamData.live) {
                const channel = client.channels.cache.get(sub.channel_id);
                if (channel) {
                    const notification = formatTwitchNotification(sub.target_id, streamData);
                    if (notification) {channel.send(notification).catch(() => {});}
                }
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            } else if (streamData && !streamData.live) {
                await updateSub(sub.id, { last_checked: new Date().toISOString() });
            }
        }
    } catch { /* silently ignore api/channel errors */ }
}

async function pollYoutubeSubscriptions() {
    if (!client || !integrationConfig.youtubeApiKey) {return;}

    try {
        const subs = (await getSubs()).filter(s => s.type === 'youtube');
        for (const sub of subs) {
            const videos = await checkYoutubeUploads(sub.target_id, integrationConfig);
            if (!videos || videos.length === 0) {continue;}

            const seen = knownItems.get(`youtube:${sub.id}`) || new Set();
            let posted = false;

            for (const video of videos) {
                if (!seen.has(video.videoId)) {
                    const channel = client.channels.cache.get(sub.channel_id);
                    if (channel) {
                        const notification = formatYoutubeNotification(sub.target_id, video);
                        if (notification) {channel.send(notification).catch(() => {});}
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
    } catch { /* silently ignore api/channel errors */ }
}

async function pollRssSubscriptions() {
    if (!client) {return;}

    try {
        const subs = (await getSubs()).filter(s => s.type === 'rss');
        for (const sub of subs) {
            const feed = await checkRssFeed(sub.target_id);
            if (!feed || feed.items.length === 0) {continue;}

            const seen = knownItems.get(`rss:${sub.id}`) || new Set();
            let posted = false;

            for (const item of feed.items) {
                const key = item.guid || item.link;
                if (!seen.has(key)) {
                    const channel = client.channels.cache.get(sub.channel_id);
                    if (channel) {
                        const notification = formatRssNotification(feed.feedTitle, item);
                        if (notification) {channel.send(notification).catch(() => {});}
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
    } catch { /* silently ignore api/channel errors */ }
}
