import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { logSecurityEvent } from './securityLog.js';
import { logger } from '../utils/logger.js';

function hashFile(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function walk(dir, base, files = []) {
    if (!existsSync(dir)) {
        return files;
    }
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            walk(full, base, files);
        } else {
            files.push({ rel: relative(base, full).split(sep).join('/'), full });
        }
    }
    return files;
}

export async function verifyPluginManifest({
    pluginsRoot = join(process.cwd(), 'src'),
    manifestPath = join(process.cwd(), 'plugin-manifest.json'),
    manifestData = null,
    allowUnverified = process.env.ALLOW_UNVERIFIED_PLUGINS === '1'
} = {}) {
    if (allowUnverified) {
        logSecurityEvent({ event: 'manifest.verification_skipped', reason: 'ALLOW_UNVERIFIED_PLUGINS is set' });
        return { ok: true, skipped: true, checked: 0 };
    }

    if (!manifestData && !existsSync(manifestPath)) {
        return { ok: false, errors: [`Manifest file not found: ${manifestPath}`] };
    }

    const expected = manifestData || JSON.parse(readFileSync(manifestPath, 'utf8'));
    const actualFiles = walk(join(pluginsRoot, 'plugins'), dirname(pluginsRoot));
    const actual = {};
    for (const { rel, full } of actualFiles) {
        actual[rel] = hashFile(full);
    }

    const errors = [];

    for (const [rel, hash] of Object.entries(expected)) {
        if (!actual[rel]) {
            errors.push(`Manifest entry ${rel} no longer exists (missing on disk).`);
        } else if (actual[rel] !== hash) {
            errors.push(`Hash mismatch for ${rel}.`);
        }
    }

    for (const rel of Object.keys(actual)) {
        if (!expected[rel]) {
            errors.push(`File ${rel} is not in the manifest (no longer exists).`);
        }
    }

    if (errors.length > 0) {
        logger.error('[SECURITY] Plugin integrity verification failed:');
        for (const err of errors) {
            logger.error('  -', err);
        }
        return { ok: false, errors };
    }

    return { ok: true, checked: Object.keys(expected).length };
}
