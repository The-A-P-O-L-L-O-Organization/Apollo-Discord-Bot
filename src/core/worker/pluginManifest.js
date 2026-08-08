import { readFile } from 'node:fs/promises';

export const KNOWN_CAPABILITIES = new Set([
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

export function normalizeCapabilities(capabilities) {
    if (!Array.isArray(capabilities)) {
        throw new Error('Manifest capabilities must be an array.');
    }
    const unique = [...new Set(capabilities)];
    for (const cap of unique) {
        if (!KNOWN_CAPABILITIES.has(cap)) {
            throw new Error(`Unknown capability '${cap}' declared in plugin manifest.`);
        }
    }
    return unique;
}

export async function parsePluginManifest({ dir, readFile: readFileImpl = readFile }) {
    const raw = await readFileImpl(`${dir}/plugin.json`, 'utf8');
    const manifest = JSON.parse(raw);
    if (!manifest.id) {
        throw new Error('Plugin manifest is missing "id".');
    }
    if (!manifest.capabilities) {
        throw new Error('Plugin manifest must declare "capabilities".');
    }
    const capabilities = normalizeCapabilities(manifest.capabilities);
    return { id: manifest.id, name: manifest.name || manifest.id, capabilities };
}
