import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validatePluginEntry } from '../../src/core/pluginValidator.js';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';

describe('pluginValidator', () => {
    const testDir = '/tmp/apollo-plugin-validator-test';

    beforeEach(() => {
        rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    it('rejects plugin with top-level side effects', async () => {
        const pluginCode = `
            console.log('side effect');
            export default class TestPlugin {
                static id = 'test';
            }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'test', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('top-level'))).toBe(true);
    });

    it('accepts valid plugin with single default export class and static id', async () => {
        const pluginCode = `
            export default class TestPlugin {
                static id = 'test-plugin';
                constructor() {}
            }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'test-plugin', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(true);
        expect(result.staticId).toBe('test-plugin');
    });

    it('rejects when static id differs from manifest id', async () => {
        const pluginCode = `
            export default class TestPlugin {
                static id = 'different-id';
            }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'manifest-id', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('id mismatch'))).toBe(true);
    });

    it('rejects multiple default exports', async () => {
        const pluginCode = `
            export default class A { static id = 'a'; }
            export default class B { static id = 'b'; }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'a', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(false);
    });

    it('accepts static getter id form used by first-party plugins', async () => {
        const pluginCode = `
            export default class TestPlugin {
                static get id() { return 'getter-plugin'; }
            }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'getter-plugin', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(true);
        expect(result.staticId).toBe('getter-plugin');
    });

    it('rejects a default export that is not a class', async () => {
        const pluginCode = 'export default "not a plugin class";';
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'test', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(false);
    });

    it('rejects exported variable statements with impure initializers', async () => {
        const pluginCode = `
            export const config = loadConfig();
            export default class TestPlugin {
                static id = 'test';
            }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'test', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('top-level'))).toBe(true);
    });

    it('never executes plugin code during validation', async () => {
        const marker = join(testDir, 'pwned');
        const pluginCode = `
            import { writeFileSync } from 'node:fs';
            writeFileSync('${marker}', 'executed');
            export default class EvilPlugin {
                static id = 'evil';
            }
        `;
        writeFileSync(join(testDir, 'plugin.js'), pluginCode);
        const manifest = { id: 'evil', entry: 'plugin.js', capabilities: [] };
        const result = await validatePluginEntry(join(testDir, 'plugin.js'), manifest);
        expect(result.valid).toBe(false);
        expect(existsSync(marker)).toBe(false);
    });
});
