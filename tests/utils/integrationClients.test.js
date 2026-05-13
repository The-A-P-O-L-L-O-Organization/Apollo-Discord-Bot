import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('integrationClients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkTwitchStream', () => {
    it('returns null when clientId is missing', async () => {
      const { checkTwitchStream } = await import('../../src/utils/integrationClients.js');
      const result = await checkTwitchStream('someuser', { twitchClientId: '', twitchClientSecret: '' });
      expect(result).toBeNull();
    });

    it('returns live stream data when stream is active', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ok: true, json: () => ({ access_token: 'token' }) });
        return Promise.resolve({ ok: true, json: () => ({ data: [{ id: '1', title: 'Stream Title', game_name: 'Just Chatting', viewer_count: 42, thumbnail_url: 'thumb.jpg' }] }) });
      });

      const { checkTwitchStream } = await import('../../src/utils/integrationClients.js');
      const result = await checkTwitchStream('someuser', { twitchClientId: 'id', twitchClientSecret: 'secret' });
      expect(result).toEqual({ live: true, title: 'Stream Title', game: 'Just Chatting', viewers: 42, thumbnail: 'thumb.jpg' });
    });

    it('returns offline data when no active stream', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => ({ access_token: 'token' }) })
        .mockResolvedValueOnce({ ok: true, json: () => ({ data: [] }) });

      const { checkTwitchStream } = await import('../../src/utils/integrationClients.js');
      const result = await checkTwitchStream('someuser', { twitchClientId: 'id', twitchClientSecret: 'secret' });
      expect(result).toEqual({ live: false });
    });
  });

  describe('checkYoutubeUploads', () => {
    it('returns null when apiKey is missing', async () => {
      const { checkYoutubeUploads } = await import('../../src/utils/integrationClients.js');
      const result = await checkYoutubeUploads('UC123', { youtubeApiKey: '' });
      expect(result).toBeNull();
    });

    it('returns recent uploads', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => ({
          items: [
            { snippet: { title: 'Video 1', description: 'Desc', thumbnails: { high: { url: 'thumb.jpg' } } }, id: { videoId: 'vid1' } },
            { snippet: { title: 'Video 2', description: 'Desc2', thumbnails: { high: { url: 'thumb2.jpg' } } }, id: { videoId: 'vid2' } },
          ]
        })
      });

      const { checkYoutubeUploads } = await import('../../src/utils/integrationClients.js');
      const result = await checkYoutubeUploads('UC123', { youtubeApiKey: 'key' });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ title: 'Video 1', description: 'Desc', thumbnail: 'thumb.jpg', videoId: 'vid1', publishedAt: undefined });
    });
  });

  describe('checkRssFeed', () => {
    it('returns null when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const { checkRssFeed } = await import('../../src/utils/integrationClients.js');
      const result = await checkRssFeed('https://example.com/feed.xml');
      expect(result).toBeNull();
    });

    it('parses RSS items from XML', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => `<?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <title>Test Feed</title>
              <item>
                <title>First Post</title>
                <link>https://example.com/1</link>
                <guid>guid-1</guid>
                <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      });

      const { checkRssFeed } = await import('../../src/utils/integrationClients.js');
      const result = await checkRssFeed('https://example.com/feed.xml');
      expect(result).toEqual({
        feedTitle: 'Test Feed',
        items: [{
          title: 'First Post',
          link: 'https://example.com/1',
          guid: 'guid-1',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
        }],
      });
    });

    it('parses Atom items from XML', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => `<?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <title>Atom Feed</title>
            <entry>
              <title>Atom Entry</title>
              <link href="https://example.com/atom" rel="alternate"/>
              <id>atom-guid</id>
              <published>2024-01-01T00:00:00Z</published>
            </entry>
          </feed>`
      });

      const { checkRssFeed } = await import('../../src/utils/integrationClients.js');
      const result = await checkRssFeed('https://example.com/atom.xml');
      expect(result).toEqual({
        feedTitle: 'Atom Feed',
        items: [{
          title: 'Atom Entry',
          link: 'https://example.com/atom',
          guid: 'atom-guid',
          pubDate: '2024-01-01T00:00:00Z',
        }],
      });
    });
  });
});
