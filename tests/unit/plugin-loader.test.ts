// PluginLoader tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PluginLoader } from '../../src/core/PluginLoader.js'
import { Plugin } from '../../src/core/Plugin.js'
import type { TypedClient } from '../../src/core/Plugin.js'
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { verifyPluginFile } from '../../src/utils/manifest.js'
import { parsePluginManifest } from '../../src/core/worker/pluginManifest.js'

vi.mock('../../src/utils/manifest.js', () => ({
    verifyPluginFile: vi.fn()
}))

vi.mock('../../src/core/worker/pluginManifest.js', () => ({
    parsePluginManifest: vi.fn()
}))

const mockClient = {
    commands: new Map()
} as unknown as TypedClient

const mockManager = {
    bus: { subscribe: vi.fn(), unsubscribe: vi.fn() },
    registerSocketHandler: vi.fn()
}

describe('PluginLoader', () => {
    let loader: PluginLoader
    let mockWorkerHost: any
    let mockEventBus: any
    let testPluginDir: string
    let badPluginDir: string
    const fixturesDir = join('tests', 'fixtures', 'test-plugins')
    const manifestPath = join(process.cwd(), 'plugin-manifest.json')
    let originalManifest: string | null = null

    beforeEach(() => {
        if (existsSync(manifestPath)) {
            originalManifest = readFileSync(manifestPath, 'utf8')
        }
        mockWorkerHost = { spawnWorker: vi.fn(), terminateWorker: vi.fn() }
        mockEventBus = { subscribe: vi.fn(), unsubscribe: vi.fn() }
        loader = new PluginLoader({ workerHost: mockWorkerHost, eventBus: mockEventBus })
        vi.clearAllMocks()

        // Create test plugin directory with actual files in a subdirectory named after pluginId
        testPluginDir = join(fixturesDir, 'test-plugin-loader-test')
        const testPluginSubDir = join(testPluginDir, 'test-plugin')
        mkdirSync(testPluginSubDir, { recursive: true })
        
        // Write plugin.ts with relative import to actual Plugin.ts
        const pluginRelPath = relative(testPluginSubDir, join(__dirname, '..', '..', 'src', 'core', 'Plugin.ts')).replace(/\.ts$/, '.js')
        writeFileSync(join(testPluginSubDir, 'plugin.ts'), `
            import { Plugin } from '${pluginRelPath}'
            export default class TestPlugin extends Plugin {
                static override get id() { return 'test-plugin' }
                static override version = '1.0.0'
                static override description = 'Test plugin'
                static override capabilities = []
                constructor() { super({} as any, {} as any) }
                override onLoad() { return Promise.resolve() }
                override onEnable() { return Promise.resolve() }
                override onDisable() { return Promise.resolve() }
                override onUnload() { return Promise.resolve() }
                override getCommands() { return [] }
            }
        `)

        // Write plugin.json
        writeFileSync(join(testPluginSubDir, 'plugin.json'), JSON.stringify({
            id: 'test-plugin',
            name: 'Test Plugin',
            capabilities: []
        }))

        // Create bad plugin directory
        badPluginDir = join(fixturesDir, 'bad-plugin-loader-test')
        const badPluginSubDir = join(badPluginDir, 'bad-plugin')
        mkdirSync(badPluginSubDir, { recursive: true })
        
        const badPluginRelPath = relative(badPluginSubDir, join(__dirname, '..', '..', 'src', 'core', 'Plugin.ts')).replace(/\.ts$/, '.js')
        writeFileSync(join(badPluginSubDir, 'plugin.ts'), `
            import { Plugin } from '${badPluginRelPath}'
            export default class BadPlugin extends Plugin {
                static override get id() { return 'bad-plugin' }
                static override version = '1.0.0'
                static override description = 'Bad plugin'
                static override capabilities = []
                constructor() { super({} as any, {} as any) }
                override onLoad() { return Promise.resolve() }
                override onEnable() { return Promise.resolve() }
                override onDisable() { return Promise.resolve() }
                override onUnload() { return Promise.resolve() }
                override getCommands() { return [] }
            }
        `)

        writeFileSync(join(badPluginSubDir, 'plugin.json'), JSON.stringify({
            id: 'bad-plugin',
            name: 'Bad Plugin',
            capabilities: []
        }))
    })

    afterEach(() => {
        // Cleanup
        try { rmSync(testPluginDir, { recursive: true, force: true }) } catch {}
        try { rmSync(badPluginDir, { recursive: true, force: true }) } catch {}
        if (originalManifest !== null) {
            writeFileSync(manifestPath, originalManifest)
            originalManifest = null
        } else {
            try { rmSync(manifestPath, { force: true }) } catch {}
        }
    })

    it('loads plugin and verifies manifest', async () => {
        // Create a real plugin-manifest.json in cwd for this test (restored in afterEach)
        const relPath = relative(process.cwd(), join(testPluginDir, 'test-plugin', 'plugin.ts')).split(sep).join('/')
        writeFileSync(manifestPath, JSON.stringify({ [relPath]: 'hash123' }))

        vi.mocked(parsePluginManifest).mockResolvedValue({ id: 'test-plugin', name: 'Test Plugin', capabilities: [] })

        // Use relative path from cwd
        const baseDir = relative(process.cwd(), testPluginDir)
        const result = await loader.load('test-plugin', baseDir, mockClient, mockManager)
        expect(result).toBeDefined()
        expect(result.manifest).toBeDefined()
        expect(result.manifest.id).toBe('test-plugin')
    })

    it('rejects plugin with invalid manifest hash', async () => {
        // Create a real plugin-manifest.json in cwd for this test (restored in afterEach)
        const relPath = relative(process.cwd(), join(badPluginDir, 'bad-plugin', 'plugin.ts')).split(sep).join('/')
        writeFileSync(manifestPath, JSON.stringify({ [relPath]: 'expected-hash' }))

        vi.mocked(parsePluginManifest).mockResolvedValue({ id: 'bad-plugin', name: 'Bad Plugin', capabilities: [] })

        vi.mocked(verifyPluginFile).mockImplementation(() => {
            throw new Error('Manifest verification failed')
        })

        // Use relative path from cwd
        const baseDir = relative(process.cwd(), badPluginDir)
        await expect(loader.load('bad-plugin', baseDir, mockClient, mockManager)).rejects.toThrow('Manifest verification failed')
    })
})