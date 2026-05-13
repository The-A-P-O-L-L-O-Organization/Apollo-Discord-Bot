import { describe, it, expect } from 'vitest';
import { validatePluginDirectory } from '../../src/core/pluginDownloader.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('pluginDownloader', () => {
    it('should validate a valid plugin directory', async() => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-val-test-'));
        mkdirSync(join(tmpDir, 'commands'), { recursive: true });
        mkdirSync(join(tmpDir, 'events'), { recursive: true });
        writeFileSync(join(tmpDir, 'plugin.js'), 
            'export default class TestPlugin { static get id() { return "test" } }');

        const result = await validatePluginDirectory(tmpDir);
        expect(result.valid).toBe(true);
        expect(result.id).toBe('test');
    });

    it('should reject a directory without plugin.js', async() => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-val-fail-'));
        const result = await validatePluginDirectory(tmpDir);
        expect(result.valid).toBe(false);
    });

    it('should reject a directory with invalid plugin.js', async() => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-val-bad-'));
        writeFileSync(join(tmpDir, 'plugin.js'), 'export default "not a plugin class"');

        const result = await validatePluginDirectory(tmpDir);
        expect(result.valid).toBe(false);
    });
});
