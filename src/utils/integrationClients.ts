// Integration Clients
// Twitch, YouTube, and RSS feed integration clients with circuit breaker protection
import { safeFetch } from './safeFetch.js';
import { createServiceBreaker, CircuitBreakerOpenError } from './circuitBreaker.js';
import { logger } from './logger.js';

interface TwitchConfig {
    twitchClientId: string;
    twitchClientSecret: string;
}

interface YoutubeConfig {
    youtubeApiKey: string;
}

interface TwitchTokenResponse {
    access_token: string;
}

interface TwitchStreamResponse {
    data: {
        title: string;
        game_name: string;
        viewer_count: number;
        thumbnail_url: string;
    }[];
}

interface YoutubeSearchResponse {
    items?: {
        snippet: {
            title: string;
            description: string;
            thumbnails: {
                high?: { url: string };
                default?: { url: string };
            };
            publishedAt: string;
        };
        id: {
            videoId: string;
        };
    }[];
}

// Create circuit breakers for each service
const twitchBreaker = createServiceBreaker('twitch');
const youtubeBreaker = createServiceBreaker('youtube');
const rssBreaker = createServiceBreaker('rss');

interface TwitchStreamResult {
    live: boolean;
    title?: string;
    game?: string;
    viewers?: number;
    thumbnail?: string;
}

interface YoutubeVideoResult {
    title: string;
    description: string;
    thumbnail: string;
    videoId: string;
    publishedAt: string;
}

interface RssFeedResult {
    feedTitle: string;
    items: {
        title: string;
        link: string;
        guid: string;
        pubDate: string;
    }[];
}

/**
 * Checks Twitch stream status for a streamer
 * @param {string} streamerName - Twitch streamer login name
 * @param {TwitchConfig} config - Twitch API configuration
 * @returns {Promise<TwitchStreamResult | null>} Stream info or null if offline/error
 */
export async function checkTwitchStream(streamerName: string, config: TwitchConfig): Promise<TwitchStreamResult | null> {
    if (!config.twitchClientId || !config.twitchClientSecret) { return null; }

    try {
        return await twitchBreaker.execute(async () => {
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
                (error as Error & { status?: number }).status = tokenRes.status;
                throw error;
            }
            const { access_token } = await tokenRes.json() as TwitchTokenResponse;

            const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(streamerName)}`, {
                headers: {
                    'Client-ID': config.twitchClientId,
                    Authorization: `Bearer ${access_token}`
                }
            });
            if (!res.ok) {
                const error = new Error(`Twitch API error: ${res.status}`);
                (error as Error & { status?: number }).status = res.status;
                throw error;
            }

            const { data } = await res.json() as TwitchStreamResponse;
            if (!data || data.length === 0) { return { live: false }; }

            const stream = data[0];
            if (!stream) { return { live: false }; }
            return {
                live: true,
                title: stream.title,
                game: stream.game_name,
                viewers: stream.viewer_count,
                thumbnail: stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360')
            };
        });
    } catch (error) {
        if (error instanceof CircuitBreakerOpenError || (error as Error).name === 'CircuitBreakerOpenError') {
            logger.info('[CIRCUIT] Twitch circuit breaker open, skipping stream check');
            return null;
        }
        // @ts-expect-error - pino logger overloads
        logger.error('[ERROR] Twitch stream check failed:', { err: error as Error });
        return null;
    }
}

/**
 * Checks YouTube channel for recent uploads
 * @param {string} channelId - YouTube channel ID
 * @param {YoutubeConfig} config - YouTube API configuration
 * @returns {Promise<YoutubeVideoResult[] | null>} Array of recent videos or null on error
 */
export async function checkYoutubeUploads(channelId: string, config: YoutubeConfig): Promise<YoutubeVideoResult[] | null> {
    if (!config.youtubeApiKey) { return null; }

    try {
        return await youtubeBreaker.execute(async () => {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&maxResults=5&type=video&key=${config.youtubeApiKey}`
            );
            if (!res.ok) {
                const error = new Error(`YouTube API error: ${res.status}`);
                (error as Error & { status?: number }).status = res.status;
                throw error;
            }

            const body = await res.json() as YoutubeSearchResponse;
            return (body.items || []).map(item => ({
                title: item.snippet.title,
                description: item.snippet.description,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
                videoId: item.id.videoId,
                publishedAt: item.snippet.publishedAt
            }));
        });
    } catch (error) {
        if (error instanceof CircuitBreakerOpenError || (error as Error).name === 'CircuitBreakerOpenError') {
            logger.info('[CIRCUIT] YouTube circuit breaker open, skipping upload check');
            return null;
        }
        // @ts-expect-error - pino logger overloads
        logger.error('[ERROR] YouTube upload check failed:', { err: error as Error });
        return null;
    }
}

/**
 * Checks RSS feed for new items
 * @param {string} feedUrl - RSS/Atom feed URL
 * @returns {Promise<RssFeedResult | null>} Parsed feed data or null on error
 */
export async function checkRssFeed(feedUrl: string): Promise<RssFeedResult | null> {
    try {
        return await rssBreaker.execute(async () => {
            const result = await safeFetch(feedUrl, { timeoutMs: 10000 });
            const xml = result.buffer.toString('utf8');
            return parseFeedXml(xml);
        });
    } catch (error) {
        if (error instanceof CircuitBreakerOpenError || (error as Error).name === 'CircuitBreakerOpenError') {
            logger.info('[CIRCUIT] RSS circuit breaker open, skipping feed check');
            return null;
        }
        // @ts-expect-error - pino logger overloads
        logger.error('[ERROR] RSS feed check failed:', { err: error as Error });
        return null;
    }
}

interface ParsedFeedItem {
    title: string;
    link: string;
    guid: string;
    pubDate: string;
}

/**
 * Parses RSS/Atom XML into structured data
 * @param {string} xml - Raw XML string
 * @returns {RssFeedResult} Parsed feed data
 */
function parseFeedXml(xml: string): RssFeedResult {
    const items: ParsedFeedItem[] = [];
    let feedTitle = '';

    const titleMatch = /<title[^>]*>([^<]+)<\/title>/.exec(xml);
    if (titleMatch?.[1]) { feedTitle = titleMatch[1]; }

    const isAtom = xml.includes('<feed ');

    if (isAtom) {
        const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
        let entryMatch: RegExpExecArray | null;
        while ((entryMatch = entryRegex.exec(xml)) !== null) {
            const entry = entryMatch[1];
            if (!entry) {continue;}
            const title = (/<title[^>]*>([^<]+)<\/title>/.exec(entry))?.[1] || '';
            const link = (/<link[^>]+href="([^"]+)"/.exec(entry))?.[1] || '';
            const guid = (/<id[^>]*>([^<]+)<\/id>/.exec(entry))?.[1] || '';
            const pubDate = (/<published[^>]*>([^<]+)<\/published>/.exec(entry))?.[1] || '';
            items.push({ title, link, guid, pubDate });
        }
    } else {
        const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        let itemMatch: RegExpExecArray | null;
        while ((itemMatch = itemRegex.exec(xml)) !== null) {
            const entry = itemMatch[1];
            if (!entry) {continue;}
            const title = (/<title[^>]*>([^<]+)<\/title>/.exec(entry))?.[1] || '';
            const link = (/<link[^>]*>([^<]+)<\/link>/.exec(entry))?.[1] || '';
            const guid = (/<guid[^>]*>([^<]+)<\/guid>/.exec(entry))?.[1] || '';
            const pubDate = (/<pubDate[^>]*>([^<]+)<\/pubDate>/.exec(entry))?.[1] || '';
            items.push({ title, link, guid, pubDate });
        }
    }

    return { feedTitle, items };
}