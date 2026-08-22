import { safeFetch } from './safeFetch.js';
import { createServiceBreaker } from './circuitBreaker.js';
import { logger } from './utils/logger.js';

// Create circuit breakers for each service
const twitchBreaker = createServiceBreaker('twitch');
const youtubeBreaker = createServiceBreaker('youtube');
const rssBreaker = createServiceBreaker('rss');

export async function checkTwitchStream(streamerName, config) {
    if (!config.twitchClientId || !config.twitchClientSecret) {return null;}

    try {
        return await twitchBreaker.execute(async() => {
            const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    client_id: config.twitchClientId,
                    client_secret: config.twitchClientSecret,
                    grant_type: 'client_credentials'
                })
            });
            if (!tokenRes.ok) {
                const error = new Error(`Twitch token error: ${tokenRes.status}`);
                error.status = tokenRes.status;
                throw error;
            }
            const { access_token } = await tokenRes.json();

            const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(streamerName)}`, {
                headers: {
                    'Client-ID': config.twitchClientId,
                    Authorization: `Bearer ${access_token}`
                }
            });
            if (!res.ok) {
                const error = new Error(`Twitch API error: ${res.status}`);
                error.status = res.status;
                throw error;
            }

            const { data } = await res.json();
            if (!data || data.length === 0) {return { live: false };}

            const stream = data[0];
            return {
                live: true,
                title: stream.title,
                game: stream.game_name,
                viewers: stream.viewer_count,
                thumbnail: stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360')
            };
        });
    } catch (error) {
        if (error.name === 'CircuitBreakerOpenError') {
            logger.info('[CIRCUIT] Twitch circuit breaker open, skipping stream check');
            return null;
        }
        logger.error('[ERROR] Twitch stream check failed:', error.message);
        return null;
    }
}

export async function checkYoutubeUploads(channelId, config) {
    if (!config.youtubeApiKey) {return null;}

    try {
        return await youtubeBreaker.execute(async() => {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&maxResults=5&type=video&key=${config.youtubeApiKey}`
            );
            if (!res.ok) {
                const error = new Error(`YouTube API error: ${res.status}`);
                error.status = res.status;
                throw error;
            }

            const body = await res.json();
            return (body.items || []).map(item => ({
                title: item.snippet.title,
                description: item.snippet.description,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                videoId: item.id.videoId,
                publishedAt: item.snippet.publishedAt
            }));
        });
    } catch (error) {
        if (error.name === 'CircuitBreakerOpenError') {
            logger.info('[CIRCUIT] YouTube circuit breaker open, skipping upload check');
            return null;
        }
        logger.error('[ERROR] YouTube upload check failed:', error.message);
        return null;
    }
}

export async function checkRssFeed(feedUrl) {
    try {
        return await rssBreaker.execute(async() => {
            const result = await safeFetch(feedUrl, { timeoutMs: 10000 });
            const xml = result.buffer.toString('utf8');
            return parseFeedXml(xml);
        });
    } catch (error) {
        if (error.name === 'CircuitBreakerOpenError') {
            logger.info('[CIRCUIT] RSS circuit breaker open, skipping feed check');
            return null;
        }
        logger.error('[ERROR] RSS feed check failed:', error.message);
        return null;
    }
}

function parseFeedXml(xml) {
    const items = [];
    let feedTitle = '';

    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) {feedTitle = titleMatch[1];}

    const isAtom = xml.includes('<feed ');

    if (isAtom) {
        const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
        let entryMatch;
        while ((entryMatch = entryRegex.exec(xml)) !== null) {
            const entry = entryMatch[1];
            const title = entry.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || '';
            const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
            const guid = entry.match(/<id[^>]*>([^<]+)<\/id>/)?.[1] || '';
            const pubDate = entry.match(/<published[^>]*>([^<]+)<\/published>/)?.[1] || '';
            items.push({ title, link, guid, pubDate });
        }
    } else {
        const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(xml)) !== null) {
            const entry = itemMatch[1];
            const title = entry.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || '';
            const link = entry.match(/<link[^>]*>([^<]+)<\/link>/)?.[1] || '';
            const guid = entry.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1] || '';
            const pubDate = entry.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/)?.[1] || '';
            items.push({ title, link, guid, pubDate });
        }
    }

    return { feedTitle, items };
}
