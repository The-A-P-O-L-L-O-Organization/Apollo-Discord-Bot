import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginLoader } from '../../src/core/PluginLoader.js'

describe('PluginLoader', () => {
    let loader: PluginLoader

    beforeEach(() => {
        const mockWorkerHost = { isDisabled: vi.fn(), startPlugin: vi.fn(), terminateWorker: vi.fn() };
        const mockEventBus = { subscribe: vi.fn(), unsubscribeAllForPlugin: vi.fn() };
        loader = new PluginLoader({ eventBus: mockEventBus, workerHost: mockWorkerHost });
    })

    it('refuses in-process loads and directs to sandboxed startup', async () => {
        await expect(loader.load('demo', './data/plugins', {} as never, {} as never)).rejects.toThrow(/loadInstalledPlugin/i);
    })

    it('returns undefined for unknown plugins and clears cache safely', () => {
        expect(loader.getLoadedPlugin('missing')).toBeUndefined();
        expect(() => loader.clearCache('missing')).not.toThrow();
    })
})
