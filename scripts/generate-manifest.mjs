import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PLUGINS_ROOT = join(process.cwd(), 'src', 'plugins');
const OUTPUT = join(process.cwd(), 'plugin-manifest.json');

function walk(dir, base, files = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            walk(full, base, files);
        } else {
            const rel = relative(base, full).split(sep).join('/');
            files.push({ rel, full });
        }
    }
    return files;
}

const files = walk(PLUGINS_ROOT, process.cwd());
const manifest = {};
for (const { rel, full } of files) {
    manifest[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
}

writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[MANIFEST] Wrote ${Object.keys(manifest).length} file hash(es) to plugin-manifest.json`);
