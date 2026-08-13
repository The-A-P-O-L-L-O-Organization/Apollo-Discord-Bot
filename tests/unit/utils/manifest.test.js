import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPluginManifest } from '../../../src/utils/manifest.js';
import { createHash } from 'node:crypto';

function hash(content) {
    return createHash('sha256').update(content).digest('hex');
}

describe('verifyPluginManifest', () => {
    let root;
    let pluginsDir;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'manifest-test-'));
        pluginsDir = join(root, 'src', 'plugins');
        mkdirSync(pluginsDir, { recursive: true });
        mkdirSync(join(pluginsDir, 'alpha'), { recursive: true });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
        delete process.env.ALLOW_UNVERIFIED_PLUGINS;
    });

    it('should pass when files match the manifest', async() => {
        writeFileSync(join(pluginsDir, 'alpha', 'plugin.js'), 'export default class A {}');
        const manifest = {
            'src/plugins/alpha/plugin.js': hash('export default class A {}')
        };
        const result = await verifyPluginManifest({ pluginsRoot: join(root, 'src'), manifestPath: join(root, 'manifest.json'), manifestData: manifest });
        expect(result.ok).toBe(true);
        expect(result.checked).toBe(1);
    });

    it('should fail on hash mismatch', async() => {
        writeFileSync(join(pluginsDir, 'alpha', 'plugin.js'), 'export default class A {}');
        const manifest = {
            'src/plugins/alpha/plugin.js': hash('different content')
        };
        const result = await verifyPluginManifest({ pluginsRoot: join(root, 'src'), manifestPath: join(root, 'manifest.json'), manifestData: manifest });
        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('mismatch'))).toBe(true);
    });

    it('should fail on missing file', async() => {
        const manifest = {
            'src/plugins/alpha/plugin.js': hash('export default class A {}')
        };
        const result = await verifyPluginManifest({ pluginsRoot: join(root, 'src'), manifestPath: join(root, 'manifest.json'), manifestData: manifest });
        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('missing'))).toBe(true);
    });

    it('should fail on orphaned manifest entry', async() => {
        writeFileSync(join(pluginsDir, 'alpha', 'plugin.js'), 'export default class A {}');
        const manifest = {
            'src/plugins/alpha/plugin.js': hash('export default class A {}'),
            'src/plugins/ghost.js': hash('nope')
        };
        const result = await verifyPluginManifest({ pluginsRoot: join(root, 'src'), manifestPath: join(root, 'manifest.json'), manifestData: manifest });
        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('no longer exists'))).toBe(true);
    });

    it('should skip when ALLOW_UNVERIFIED_PLUGINS is set', async() => {
        process.env.ALLOW_UNVERIFIED_PLUGINS = '1';
        const result = await verifyPluginManifest({ pluginsRoot: join(root, 'src'), manifestPath: join(root, 'manifest.json') });
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
    });

    it('should read manifest from disk when manifestData not provided', async() => {
        writeFileSync(join(pluginsDir, 'alpha', 'plugin.js'), 'export default class A {}');
        writeFileSync(join(root, 'manifest.json'), JSON.stringify({
            'src/plugins/alpha/plugin.js': hash('export default class A {}')
        }));
        const result = await verifyPluginManifest({ pluginsRoot: join(root, 'src'), manifestPath: join(root, 'manifest.json') });
        expect(result.ok).toBe(true);
    });
});
