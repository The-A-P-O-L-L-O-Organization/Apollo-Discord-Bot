import { existsSync, rmSync } from 'fs';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync } from 'fs';
import { lookup as dnsLookup } from 'node:dns';

const PRIVATE_IPV4_RANGES = [
    { start: '10.0.0.0', end: '10.255.255.255' },
    { start: '100.64.0.0', end: '100.127.255.255' },
    { start: '127.0.0.0', end: '127.255.255.255' },
    { start: '169.254.0.0', end: '169.254.255.255' },
    { start: '172.16.0.0', end: '172.31.255.255' },
    { start: '192.168.0.0', end: '192.168.255.255' },
    { start: '0.0.0.0', end: '0.255.255.255' }
];

function ipv4ToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc * 256) + Number(octet), 0);
}

export function isPrivateIp(ip) {
    if (ip.includes(':')) {
        const lower = ip.toLowerCase();
        return lower === '::1'
            || lower.startsWith('fc00::')
            || lower.startsWith('fe80::')
            || lower === '::'
            || lower.startsWith('fec0::');
    }
    const int = ipv4ToInt(ip);
    return PRIVATE_IPV4_RANGES.some(({ start, end }) =>
        int >= ipv4ToInt(start) && int <= ipv4ToInt(end));
}

export function isAllowedProtocol(protocol) {
    return protocol === 'https:';
}

export function resolvePublicIps(hostname) {
    return new Promise((resolve, reject) => {
        dnsLookup(hostname, { all: true }, (err, addresses) => {
            if (err) { return reject(new Error(`DNS lookup failed for ${hostname}`)); }
            const ips = addresses.map(a => a.address);
            const blocked = ips.filter(ip => isPrivateIp(ip));
            if (blocked.length > 0) {
                return reject(new Error(`Plugin URL resolves to a private/internal address (${blocked.join(', ')}).`));
            }
            resolve(ips);
        });
    });
}

export async function downloadAndExtractPlugin(url, destDir) {
    if (!url) {throw new Error('No download URL provided');}

    const response = await fetch(url);
    if (!response.ok) {throw new Error(`Download failed: ${response.status} ${response.statusText}`);}

    const buffer = Buffer.from(await response.arrayBuffer());

    if (url.endsWith('.zip') || response.headers.get('content-type')?.includes('zip')) {
        extractZip(buffer, destDir);
    } else if (url.endsWith('.tar.gz') || url.endsWith('.tgz')) {
        throw new Error('tar.gz extraction not yet implemented');
    } else {
        throw new Error('Unsupported archive format. Only .zip and .tar.gz are supported.');
    }
}

function extractZip(buffer, destDir) {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const entryNames = entries.filter(e => !e.isDirectory).map(e => e.entryName);
    const commonPrefix = findCommonPrefix(entryNames);

    if (rmSync && existsSync(destDir)) {
        rmSync(destDir, { recursive: true, force: true });
    }
    mkdirSync(destDir, { recursive: true });

    for (const entry of entries) {
        if (entry.isDirectory) {continue;}
        const relativePath = entry.entryName.startsWith(commonPrefix)
            ? entry.entryName.slice(commonPrefix.length)
            : entry.entryName;
        if (!relativePath) {continue;}
        const targetPath = join(destDir, relativePath);
        const resolved = resolve(targetPath);
        if (!resolved.startsWith(resolve(destDir) + sep)) {
            throw new Error(`Invalid archive entry: ${entry.entryName}`);
        }
        mkdirSync(join(targetPath, '..'), { recursive: true });
        writeFileSync(targetPath, entry.getData());
    }
}

function findCommonPrefix(paths) {
    if (paths.length === 0) {return '';}
    const parts = paths.map(p => p.split('/'));
    const prefix = [];
    for (let i = 0; i < parts[0].length; i++) {
        const part = parts[0][i];
        if (parts.every(p => p[i] === part)) {
            prefix.push(part);
        } else {
            break;
        }
    }
    const result = prefix.join('/');
    return result ? result + '/' : '';
}

export async function validatePluginDirectory(dir) {
    const pluginPath = join(dir, 'plugin.js');
    if (!existsSync(pluginPath)) {
        return { valid: false, error: 'No plugin.js found' };
    }

    try {
        const url = pathToFileURL(pluginPath).href + '?t=' + Date.now();
        const mod = await import(url);
        const PluginClass = mod.default;
        if (!PluginClass || !PluginClass.id) {
            return { valid: false, error: 'plugin.js must export a class with static id' };
        }
        return { valid: true, id: PluginClass.id };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}
