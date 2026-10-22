// Integration Clients
// Twitch, YouTube, and RSS feed integration clients with circuit breaker protection
import { safeFetch } from './safeFetch.js';
import { createServiceBreaker, CircuitBreakerOpenError } from './circuitBreaker.js';
import { logger } from './logger.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

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
            return (body.items ?? []).map(item => ({
                title: item.snippet.title,
                description: item.snippet.description,
                thumbnail: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? '',
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

interface ParsedXmlObject {
    [key: string]: ParsedXmlValue;
}

interface ParsedXmlArray extends Array<ParsedXmlValue> {}

type ParsedXmlValue = ParsedXmlObject | ParsedXmlArray | string | number | boolean | null | undefined;

interface ParsedFeedItem {
    title: string;
    link: string;
    guid: string;
    pubDate: string;
}

const feedParser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
    maxNestedTags: 50,
    isArray: (tagName: string) => tagName === 'item' || tagName === 'entry' || tagName === 'link'
});

function asArray(value: ParsedXmlValue): ParsedXmlValue[] {
    if (Array.isArray(value)) {
        return value as ParsedXmlValue[];
    }
    return value === undefined || value === null ? [] : [value];
}

function textValue(value: ParsedXmlValue): string {
    if (Array.isArray(value)) {
        return textValue(value[0]);
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    const text = value['#text'];
    return typeof text === 'string' || typeof text === 'number' || typeof text === 'boolean'
        ? String(text).trim()
        : '';
}

function atomLinkValue(value: ParsedXmlValue): string {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return textValue(value);
    }
    for (const link of asArray(value)) {
        if (!link || typeof link !== 'object' || Array.isArray(link)) {
            continue;
        }
        const href = link['@_href'];
        if (typeof href === 'string' && href.trim()) {
            const rel = link['@_rel'];
            if (rel === undefined || rel === 'alternate') {
                return href.trim();
            }
        }
    }
    return textValue(value);
}

function normalizeFeedItem(entry: ParsedXmlValue, atom: boolean): ParsedFeedItem {
    const record: ParsedXmlObject = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry
        : {};
    const title = textValue(record['title']);
    const link = atom ? atomLinkValue(record['link']) : textValue(record['link']);
    const sourceGuid = textValue(atom ? record['id'] : record['guid']);
    const guid = sourceGuid || link;
    const pubDate = textValue(atom ? (record['published'] ?? record['updated']) : record['pubDate']);
    return { title, link, guid, pubDate };
}

function parseFeedXml(xml: string): RssFeedResult {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
        throw new Error(`Invalid feed XML: ${validation.err.msg}`);
    }

    const document = feedParser.parse(xml) as Record<string, ParsedXmlValue>;
    const atomFeed = document['feed'];
    if (atomFeed && typeof atomFeed === 'object') {
        const feed = atomFeed as Record<string, ParsedXmlValue>;
        return {
            feedTitle: textValue(feed['title']),
            items: asArray(feed['entry']).map(entry => normalizeFeedItem(entry, true))
        };
    }

    const rss = document['rss'];
    const rdf = document['RDF'];
    const rootRecord = rss && typeof rss === 'object' && !Array.isArray(rss)
        ? rss as ParsedXmlObject
        : rdf && typeof rdf === 'object' && !Array.isArray(rdf)
            ? rdf as ParsedXmlObject
            : {};
    const channel = rootRecord['channel'];
    const channelRecord = channel && typeof channel === 'object' ? channel as Record<string, ParsedXmlValue> : {};
    return {
        feedTitle: textValue(channelRecord['title']),
        items: asArray(channelRecord['item'] ?? rootRecord['item']).map(entry => normalizeFeedItem(entry, false))
    };
}
