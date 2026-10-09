import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const KNOWN_CAPABILITIES = new Set<string>([
    'events:messageCreate',
    'events:messageDelete',
    'events:messageUpdate',
    'events:guildMemberAdd',
    'events:guildMemberRemove',
    'events:channelCreate',
    'events:ready',
    'api:sendMessage',
    'api:getOwnConfig',
    'api:setOwnConfig',
    'api:commandReply',
    'api:i18n'
]);

export function normalizeCapabilities(capabilities: unknown): string[] {
    if (!Array.isArray(capabilities)) {
        throw new Error('Manifest capabilities must be an array.');
    }
    const unique = [...new Set(capabilities as string[])];
    for (const cap of unique) {
        if (!KNOWN_CAPABILITIES.has(cap)) {
            throw new Error(`Unknown capability '${cap}' declared in plugin manifest.`);
        }
    }
    return unique;
}

export interface ParsedPluginManifest {
    id: string;
    name: string;
    capabilities: string[];
}

export interface ParsePluginManifestOptions {
    dir: string;
    readFile?: typeof readFile;
}

export async function parsePluginManifest({ dir, readFile: readFileImpl = readFile }: ParsePluginManifestOptions): Promise<ParsedPluginManifest> {
    const raw = await readFileImpl(`${dir}/plugin.json`, 'utf8');
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    if (!manifest['id']) {
        throw new Error('Plugin manifest is missing "id".');
    }
    if (!manifest['capabilities']) {
        throw new Error('Plugin manifest must declare "capabilities".');
    }
    const capabilities = normalizeCapabilities(manifest['capabilities']);
    const manifestId = manifest['id'] as string;
    const manifestName = (manifest['name'] ?? manifest['id']) as string;
    return { id: manifestId, name: manifestName, capabilities };
}

export interface ArchiveManifest {
    files: Record<string, string>;
    entry: string;
    pluginId: string;
    capabilities: string[];
}

export function generateFileHashes(pluginDir: string): Record<string, string> {
    const files: Record<string, string> = {};
    const stack: string[] = [pluginDir];
    while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) {
            break;
        }
        for (const name of readdirSync(current)) {
            if (name === 'node_modules' || name === '.git') {
                continue;
            }
            const full = join(current, name);
            if (statSync(full).isDirectory()) {
                stack.push(full);
            } else {
                const rel = relative(pluginDir, full).split(sep).join('/');
                files[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
            }
        }
    }
    return files;
}

export function canonicalizeManifest(manifest: ArchiveManifest): string {
    const sortedFiles: Record<string, string> = {};
    for (const key of Object.keys(manifest.files).sort()) {
        const value = manifest.files[key];
        if (typeof value === 'string') {
            sortedFiles[key] = value;
        }
    }
    const capabilities = [...manifest.capabilities].sort();
    return JSON.stringify({ capabilities, entry: manifest.entry, files: sortedFiles, pluginId: manifest.pluginId });
}

export async function generateManifest(pluginDir: string): Promise<ArchiveManifest> {
    const raw = await readFile(join(pluginDir, 'plugin.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed['id'] !== 'string' || parsed['id'].length === 0) {
        throw new Error('Plugin manifest is missing "id".');
    }
    const entry = typeof parsed['entry'] === 'string' && parsed['entry'].length > 0 ? parsed['entry'] : 'plugin.js';
    const capabilities: string[] = Array.isArray(parsed['capabilities'])
        ? (parsed['capabilities'] as unknown[]).filter((cap): cap is string => typeof cap === 'string')
        : [];
    return { capabilities, entry, files: generateFileHashes(pluginDir), pluginId: parsed['id'] };
}