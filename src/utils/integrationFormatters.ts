// Integration Formatters
// Formats integration notifications for Discord embeds

interface TwitchStreamData {
    live: boolean;
    title?: string;
    game?: string;
    viewers?: number;
    thumbnail?: string;
}

interface YoutubeVideoData {
    title: string;
    description: string;
    thumbnail: string;
    videoId: string;
    publishedAt: string;
}

interface RssItemData {
    title: string;
    link: string;
    guid: string;
    pubDate: string;
}

export interface GithubCommit {
    message: string;
    url: string;
}

export interface GithubPR {
    number: number;
    title: string;
    html_url: string;
    body?: string;
    state: 'open' | 'closed';
}

export interface GithubIssue {
    number: number;
    title: string;
    html_url: string;
    body?: string;
}

export interface NotificationPayload {
    content?: string;
    embeds: Array<{
        color: number;
        title: string;
        url: string;
        fields?: Array<{ name: string; value: string; inline?: boolean }>;
        thumbnail?: { url: string };
        timestamp: string;
        description?: string;
    }>;
}

/**
 * Formats Twitch stream notification
 * @param {string} streamerName - Twitch streamer login name
 * @param {TwitchStreamData} streamData - Stream data from checkTwitchStream
 * @returns {NotificationPayload | null} Notification payload or null if not live
 */
export function formatTwitchNotification(streamerName: string, streamData: TwitchStreamData): NotificationPayload | null {
    if (!streamData.live) { return null; }

    return {
        content: `🔴 **${streamerName}** is now live!`,
        embeds: [{
            color: 0x9146FF,
            title: streamData.title ?? '',
            url: `https://twitch.tv/${streamerName}`,
            fields: [
                { name: 'Game', value: streamData.game ?? '', inline: true },
                { name: 'Viewers', value: String(streamData.viewers ?? 0), inline: true }
            ],
            thumbnail: { url: streamData.thumbnail ?? '' },
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Formats YouTube video notification
 * @param {string} channelName - YouTube channel name
 * @param {YoutubeVideoData} video - Video data from checkYoutubeUploads
 * @returns {NotificationPayload} Notification payload
 */
export function formatYoutubeNotification(channelName: string, video: YoutubeVideoData): NotificationPayload {
    return {
        content: `📹 **${channelName}** uploaded a new video!`,
        embeds: [{
            color: 0xFF0000,
            title: video.title,
            url: `https://youtu.be/${video.videoId}`,
            thumbnail: video.thumbnail ? { url: video.thumbnail } : undefined,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Formats RSS feed notification
 * @param {string} feedTitle - Feed title
 * @param {RssItemData} item - RSS item data
 * @returns {NotificationPayload} Notification payload
 */
export function formatRssNotification(feedTitle: string, item: RssItemData): NotificationPayload {
    return {
        content: `📰 **${feedTitle}**`,
        embeds: [{
            color: 0xFFA500,
            title: item.title,
            url: item.link,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Formats GitHub push notification
 * @param {string} repo - Repository name (owner/repo)
 * @param {string} sender - Sender username
 * @param {string} ref - Git ref (e.g., refs/heads/main)
 * @param {GithubCommit[]} commits - Array of commits
 * @returns {NotificationPayload} Notification payload
 */
export function formatGithubPushNotification(repo: string, sender: string, ref: string, commits: GithubCommit[]): NotificationPayload {
    const branch = ref.replace('refs/heads/', '');
    const commitList = (commits || []).slice(0, 5).map(c =>
        `[${c.message.split('\n')[0]}](${c.url})`
    ).join('\n');

    return {
        embeds: [{
            color: 0x2B7489,
            title: `[${repo}] Push to ${branch}`,
            url: `https://github.com/${repo}`,
            description: commitList || 'No commits',
            fields: [{ name: 'Author', value: sender, inline: true }],
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Formats GitHub PR notification
 * @param {string} repo - Repository name (owner/repo)
 * @param {string} sender - Sender username
 * @param {GithubPR} pr - PR data
 * @returns {NotificationPayload} Notification payload
 */
export function formatGithubPrNotification(repo: string, sender: string, pr: GithubPR): NotificationPayload {
    return {
        embeds: [{
            color: pr.state === 'open' ? 0x2CBE4E : 0xCB2431,
            title: `#${pr.number} ${pr.title}`,
            url: pr.html_url,
            description: (pr.body || '').slice(0, 200),
            fields: [
                { name: 'Repository', value: repo, inline: true },
                { name: 'Author', value: sender, inline: true }
            ],
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Formats GitHub issue notification
 * @param {string} repo - Repository name (owner/repo)
 * @param {string} sender - Sender username
 * @param {GithubIssue} issue - Issue data
 * @returns {NotificationPayload} Notification payload
 */
export function formatGithubIssueNotification(repo: string, sender: string, issue: GithubIssue): NotificationPayload {
    return {
        embeds: [{
            color: 0x1D1D1D,
            title: `#${issue.number} ${issue.title}`,
            url: issue.html_url,
            description: (issue.body || '').slice(0, 200),
            fields: [
                { name: 'Repository', value: repo, inline: true },
                { name: 'Author', value: sender, inline: true }
            ],
            timestamp: new Date().toISOString()
        }]
    };
}