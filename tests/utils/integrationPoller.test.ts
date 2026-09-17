import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/db.js', () => ({
    getData: vi.fn(),
    setData: vi.fn()
}));

describe('integrationPoller', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
    });

    it('init starts interval timers for each poller type', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        const mockClient = { channels: { cache: { get: vi.fn() } } };
        const mockConfig = { integrations: { pollInterval: { twitch: 60000, youtube: 60000, rss: 120000 }, twitchClientId: '', twitchClientSecret: '', youtubeApiKey: '' } };

        poller.initIntegrationPoller(mockClient, mockConfig);
        expect(vi.getTimerCount()).toBeGreaterThanOrEqual(3);

        poller.stopIntegrationPoller();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stopIntegrationPoller does not throw when not started', async() => {
        const poller = await import('../../src/utils/integrationPoller.js');
        expect(() => poller.stopIntegrationPoller()).not.toThrow();
    });
});
