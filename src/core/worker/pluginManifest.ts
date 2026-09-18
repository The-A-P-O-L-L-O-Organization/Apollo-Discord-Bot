import { readFile } from 'node:fs/promises';

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
    'api:commandReply'
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