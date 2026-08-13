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
    const parts = ip.split('.');
    if (parts.length !== 4) { return NaN; }
    return parts.reduce((acc, octet) => {
        const n = Number(octet);
        if (!Number.isFinite(n)) { return NaN; }
        return (acc * 256) + n;
    }, 0);
}

function isPrivateIp(ip) {
    if (ip.includes(':')) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') { return true; }
        if (lower.startsWith('fc') || lower.startsWith('fd')) { return true; }
        if (lower.startsWith('fe80:') || lower.startsWith('fec0:')) { return true; }
        if (lower.startsWith('::ffff:')) {
            const v4 = lower.slice(7);
            if (v4.includes('.')) { return isPrivateIp(v4); }
        }
        return false;
    }
    const int = ipv4ToInt(ip);
    if (!Number.isFinite(int)) { return true; }
    return PRIVATE_IPV4_RANGES.some(({ start, end }) =>
        int >= ipv4ToInt(start) && int <= ipv4ToInt(end));
}

function resolvePublicIps(hostname) {
    return new Promise((resolve, reject) => {
        dnsLookup(hostname, { all: true }, (err, addresses) => {
            if (err) { return reject(new Error(`DNS lookup failed for ${hostname}`)); }
            const ips = addresses.map(a => a.address);
            const blocked = ips.filter(ip => isPrivateIp(ip));
            if (blocked.length > 0) {
                return reject(new Error(`URL resolves to a private/internal address (${blocked.join(', ')}).`));
            }
            resolve(ips);
        });
    });
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;

export async function safeFetch(url, {
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    skipDnsCheck = false
} = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed.');
    }
    if (!skipDnsCheck) {
        await resolvePublicIps(parsed.hostname);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetchImpl(url, { signal: controller.signal });
    } catch (err) {
        clearTimeout(timer);
        throw new Error(`Fetch failed: ${err.message}`, { cause: err });
    }
    clearTimeout(timer);

    if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
        throw new Error(`Response exceeds ${maxBytes} byte limit.`);
    }

    return {
        buffer,
        contentType: response.headers.get('content-type') || '',
        finalUrl: response.url || url
    };
}
