import { existsSync, rmSync } from 'fs';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync } from 'fs';
import { lookup as dnsLookup } from 'node:dns';
import { createHash } from 'node:crypto';

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
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) { return isPrivateIp(mapped[1]); }
        return lower === '::1'
            || lower.startsWith('fc')
            || lower.startsWith('fd')
            || lower.startsWith('fe80::')
            || lower === '::'
            || lower.startsWith('fec0::');
    }
    const int = ipv4ToInt(ip);
    if (!Number.isFinite(int)) { return true; }
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

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_REDIRECTS = 5;

export async function downloadPluginArchive(url, {
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    fetchImpl = fetch,
    expectedSha256 = null,
    skipDnsCheck = false
} = {}) {
    if (!url) {
        throw new Error('Plugin download URL is required.');
    }

    const parsed = new URL(url);
    if (!isAllowedProtocol(parsed.protocol)) {
        throw new Error('Plugin downloads must use https.');
    }

    if (!skipDnsCheck) {
        await resolvePublicIps(parsed.hostname);
    }

    let currentUrl = url;
    let redirects = 0;

    const deadline = Date.now() + timeoutMs;

    while (true) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error('Plugin download timed out.');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remaining);
        let response;
        try {
            response = await fetchImpl(currentUrl, { signal: controller.signal, redirect: 'manual' });
        } catch (err) {
            clearTimeout(timer);
            throw new Error(`Plugin download failed: ${err.message}`, { cause: err });
        }
        clearTimeout(timer);

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) {
                throw new Error('Plugin download redirect missing Location header.');
            }
            redirects += 1;
            if (redirects > maxRedirects) {
                throw new Error('Plugin download exceeded maximum redirects.');
            }
            const next = new URL(location, currentUrl);
            if (!isAllowedProtocol(next.protocol)) {
                throw new Error('Plugin download redirects must use https.');
            }
            if (!skipDnsCheck) {
                await resolvePublicIps(next.hostname);
            }
            currentUrl = next.href;
            continue;
        }

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) {
            throw new Error(`Plugin download exceeds ${maxBytes} byte limit.`);
        }

        if (expectedSha256) {
            const actual = createHash('sha256').update(buffer).digest('hex');
            if (actual !== expectedSha256.toLowerCase()) {
                throw new Error('Plugin download hash mismatch.');
            }
        }

        return {
            buffer,
            contentType: response.headers.get('content-type') || '',
            finalUrl: currentUrl
        };
    }
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
