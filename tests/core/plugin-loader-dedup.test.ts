import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Plugin loader dedup', () => {
    it('prefers .js when both .ts and .js exist', () => {
        const dir = mkdtempSync(join(tmpdir(), 'plug-'));
        mkdirSync(join(dir, 'commands'));
        writeFileSync(join(dir, 'commands', 'ping.ts'), 'export default { name: "ping", ts: true };');
        writeFileSync(join(dir, 'commands', 'ping.js'), 'export default { name: "ping", js: true };');
        const files = readdirSync(join(dir, 'commands')).filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'));
        const seen = new Set<string>();
        const deduped: string[] = [];
        const fileSet = new Set(files);
        for (const f of files) {
            if (f.endsWith('.ts') && fileSet.has(f.replace(/\.ts$/, '.js'))) { continue; }
            const base = f.replace(/\.(ts|js)$/, '');
            if (seen.has(base)) { continue; }
            seen.add(base);
            deduped.push(f);
        }
        expect(deduped).toEqual(['ping.js']);
    });
});
