import { describe, it, expect } from 'vitest';

describe('integrationFormatters', () => {
    describe('formatTwitchNotification', () => {
        it('returns a message object for a live Twitch stream', async() => {
            const { formatTwitchNotification } = await import('../../src/utils/integrationFormatters.js');
            const result = formatTwitchNotification('shroud', { live: true, title: 'Valorant', game: 'Valorant', viewers: 5000, thumbnail: 'thumb.jpg' });
            expect(result.content).toContain('now live');
            expect(result.embeds[0].title).toBe('Valorant');
        });

        it('returns null when not live', async() => {
            const { formatTwitchNotification } = await import('../../src/utils/integrationFormatters.js');
            const result = formatTwitchNotification('shroud', { live: false });
            expect(result).toBeNull();
        });
    });

    describe('formatYoutubeNotification', () => {
        it('returns a message object for a new YouTube video', async() => {
            const { formatYoutubeNotification } = await import('../../src/utils/integrationFormatters.js');
            const result = formatYoutubeNotification('Channel Name', { title: 'My Video', videoId: 'abc123', thumbnail: 'thumb.jpg' });
            expect(result.content).toContain('Channel Name');
            expect(result.embeds[0].title).toBe('My Video');
            expect(result.embeds[0].url).toBe('https://youtu.be/abc123');
        });
    });

    describe('formatRssNotification', () => {
        it('returns a message object for an RSS item', async() => {
            const { formatRssNotification } = await import('../../src/utils/integrationFormatters.js');
            const result = formatRssNotification('My Feed', { title: 'Article 1', link: 'https://example.com/1' });
            expect(result.content).toContain('My Feed');
            expect(result.embeds[0].url).toBe('https://example.com/1');
        });
    });

    describe('formatGithubPushNotification', () => {
        it('returns a message object for a push event', async() => {
            const { formatGithubPushNotification } = await import('../../src/utils/integrationFormatters.js');
            const result = formatGithubPushNotification('owner/repo', 'user', 'refs/heads/main', [
                { message: 'Fix bug', url: 'https://github.com/owner/repo/commit/abc' }
            ]);
            expect(result.embeds[0].title).toContain('owner/repo');
        });
    });

    describe('formatGithubPrNotification', () => {
        it('returns a message object for a PR event', async() => {
            const { formatGithubPrNotification } = await import('../../src/utils/integrationFormatters.js');
            const result = formatGithubPrNotification('owner/repo', 'user', { number: 1, title: 'My PR', body: 'Description', html_url: 'https://github.com/owner/repo/pull/1', state: 'open' });
            expect(result.embeds[0].title).toContain('#1');
        });
    });
});
