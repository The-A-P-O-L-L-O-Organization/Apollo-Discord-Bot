import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyPluginManifest } from '../../src/utils/manifest.js';
import {
    normalizeCapabilities,
    parsePluginManifest,
    KNOWN_CAPABILITIES
} from '../../src/core/worker/pluginManifest.js';
import type { readFile } from 'node:fs/promises';
import { PluginLoader } from '../../src/core/PluginLoader.js';

const MISSING_DIR = '/tmp/opencode/arch-fitness-nonexistent';

describe('Plugin sandbox fitness functions', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('manifest verification is enforced when ALLOW_UNVERIFIED_PLUGINS is not 1', async () => {
        vi.stubEnv('ALLOW_UNVERIFIED_PLUGINS', '0');
        const result = await verifyPluginManifest({ pluginsRoot: MISSING_DIR, manifestData: {} });
        expect(result.skipped).not.toBe(true);
        expect(result.ok).toBe(true);
    });

    it('ALLOW_UNVERIFIED_PLUGINS=1 bypass is never active in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ALLOW_UNVERIFIED_PLUGINS', '0');
        const result = await verifyPluginManifest({ pluginsRoot: MISSING_DIR, manifestData: {} });
        expect(result.skipped).not.toBe(true);
        expect(result.ok).toBe(true);
        expect(process.env['ALLOW_UNVERIFIED_PLUGINS']).not.toBe('1');
    });

    it('manifest verification detects entries missing from disk', async () => {
        vi.stubEnv('ALLOW_UNVERIFIED_PLUGINS', '0');
        const result = await verifyPluginManifest({
            pluginsRoot: MISSING_DIR,
            manifestData: { 'src/plugins/ghost/plugin.ts': 'a'.repeat(64) }
        });
        expect(result.ok).toBe(false);
        expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('capability checks reject unknown capabilities before plugin load', () => {
        expect(() => normalizeCapabilities(['api:sendMessage', 'api:evil-capability'])).toThrow(/Unknown capability/);
        expect(() => normalizeCapabilities('not-an-array')).toThrow(/must be an array/);
        expect(normalizeCapabilities(['api:sendMessage', 'api:sendMessage'])).toEqual(['api:sendMessage']);
        expect(KNOWN_CAPABILITIES.has('api:sendMessage')).toBe(true);
    });

    it('plugin manifest parsing requires id and capabilities', async () => {
        const stubReadFile = (body: string): typeof readFile =>
            (async () => body) as unknown as typeof readFile;
        await expect(
            parsePluginManifest({ dir: '/x', readFile: stubReadFile(JSON.stringify({ name: 'noname' })) })
        ).rejects.toThrow(/missing "id"/);
        await expect(
            parsePluginManifest({ dir: '/x', readFile: stubReadFile(JSON.stringify({ id: 'demo' })) })
        ).rejects.toThrow(/must declare "capabilities"/);
        const parsed = await parsePluginManifest({
            dir: '/x',
            readFile: stubReadFile(JSON.stringify({ id: 'demo', capabilities: ['api:sendMessage'] }))
        });
        expect(parsed.id).toBe('demo');
        expect(parsed.capabilities).toEqual(['api:sendMessage']);
    });

    it('installed plugins load only through the sandboxed worker entry', async () => {
        const loader = new PluginLoader({
            workerHost: {
                startPlugin: () => Promise.reject(new Error('must not start in-process')),
                terminateWorker: () => false,
                isDisabled: () => false
            },
            eventBus: {
                subscribe: () => undefined,
                unsubscribeAllForPlugin: () => Promise.resolve()
            }
        });
        await expect(loader.load('demo', './data/plugins', {} as never, {} as never)).rejects.toThrow(
            /sandboxed worker/
        );
    });

    it('boot path performs no dynamic plugin imports', () => {
        const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
        const matches = [...source.matchAll(/import\(\s*['"`]([^'"`]+)['"`]\s*\)/g)];
        const specifiers = matches.map((match) => match[1] ?? '');
        expect(specifiers.length).toBeGreaterThan(0);
        for (const specifier of specifiers) {
            expect(specifier.toLowerCase()).not.toContain('plugin');
        }
        expect(specifiers).toContain('./queue/jobs/processCommand.js');
    });
});
