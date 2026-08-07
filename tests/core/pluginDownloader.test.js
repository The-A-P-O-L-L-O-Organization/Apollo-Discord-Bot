import { describe, it, expect } from 'vitest';
import { downloadPluginArchive, isAllowedProtocol, isPrivateIp, resolvePublicIps, validatePluginDirectory } from '../../src/core/pluginDownloader.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('pluginDownloader', () => {
    it('should validate a valid plugin directory', async() => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-val-test-'));
        mkdirSync(join(tmpDir, 'commands'), { recursive: true });
        mkdirSync(join(tmpDir, 'events'), { recursive: true });
        writeFileSync(join(tmpDir, 'plugin.js'), 
            'export default class TestPlugin { static get id() { return "test" } }');

        const result = await validatePluginDirectory(tmpDir);
        expect(result.valid).toBe(true);
        expect(result.id).toBe('test');
    });

    it('should reject a directory without plugin.js', async() => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-val-fail-'));
        const result = await validatePluginDirectory(tmpDir);
        expect(result.valid).toBe(false);
    });

    it('should reject a directory with invalid plugin.js', async() => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'plugin-val-bad-'));
        writeFileSync(join(tmpDir, 'plugin.js'), 'export default "not a plugin class"');

        const result = await validatePluginDirectory(tmpDir);
        expect(result.valid).toBe(false);
    });
});

describe('pluginDownloader security validators', () => {
    it('should reject private IPv4 ranges', () => {
        expect(isPrivateIp('10.0.0.1')).toBe(true);
        expect(isPrivateIp('172.16.0.1')).toBe(true);
        expect(isPrivateIp('172.31.255.255')).toBe(true);
        expect(isPrivateIp('192.168.1.1')).toBe(true);
        expect(isPrivateIp('127.0.0.1')).toBe(true);
        expect(isPrivateIp('169.254.169.254')).toBe(true);
    });

    it('should accept public IPv4 addresses', () => {
        expect(isPrivateIp('8.8.8.8')).toBe(false);
        expect(isPrivateIp('1.1.1.1')).toBe(false);
        expect(isPrivateIp('93.184.216.34')).toBe(false);
    });

    it('should reject private IPv6 addresses', () => {
        expect(isPrivateIp('::1')).toBe(true);
        expect(isPrivateIp('fc00::1')).toBe(true);
        expect(isPrivateIp('fd00::1')).toBe(true);
        expect(isPrivateIp('fe80::1')).toBe(true);
        expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('should allow only https protocol', () => {
        expect(isAllowedProtocol('https:')).toBe(true);
        expect(isAllowedProtocol('http:')).toBe(false);
        expect(isAllowedProtocol('file:')).toBe(false);
    });

    it('should reject private IPs during resolution', async() => {
        await expect(resolvePublicIps('127.0.0.1')).rejects.toThrow(/private|internal/i);
    });

    it('should resolve public IPs', async() => {
        const ips = await resolvePublicIps('8.8.8.8');
        expect(ips).toContain('8.8.8.8');
    });

    it('should reject fd00:: ULA addresses during resolution', async() => {
        await expect(resolvePublicIps('fd00::1')).rejects.toThrow(/private|internal/i);
    });
});

describe('downloadPluginArchive', () => {
    it('should reject non-https URLs', async() => {
        await expect(downloadPluginArchive('http://example.com/p.zip'))
            .rejects.toThrow(/https/i);
    });

    it('should reject URLs resolving to private IPs', async() => {
        await expect(downloadPluginArchive('https://127.0.0.1/p.zip'))
            .rejects.toThrow(/private|internal/i);
    });

    it('should follow redirects up to the limit', async() => {
        const chunk = Buffer.alloc(1024, 0x61);
        const urls = ['https://cdn.example.com/a.zip', 'https://cdn.example.com/b.zip'];
        const responses = {
            [urls[0]]: { status: 302, headers: { location: urls[1] }, body: null },
            [urls[1]]: { status: 200, headers: { 'content-type': 'application/zip' }, body: chunk }
        };

        const result = await downloadPluginArchive(urls[0], {
            maxBytes: 1024 * 1024,
            timeoutMs: 2000,
            skipDnsCheck: true,
            fetchImpl: async(url) => {
                const r = responses[url];
                return {
                    ok: r.status < 300,
                    status: r.status,
                    statusText: String(r.status),
                    headers: { get: (name) => r.headers[name.toLowerCase()] || null },
                    url,
                    arrayBuffer: async() => r.body
                };
            }
        });

        expect(result.buffer.length).toBe(1024);
    });

    it('should reject when the download exceeds maxBytes', async() => {
        const big = Buffer.alloc(1024, 0x62);
        await expect(downloadPluginArchive('https://big.example.com/b.zip', {
            maxBytes: 512,
            timeoutMs: 2000,
            skipDnsCheck: true,
            fetchImpl: async() => ({
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => 'application/zip' },
                url: 'https://big.example.com/b.zip',
                arrayBuffer: async() => big
            })
        })).rejects.toThrow(/too large|exceeds/i);
    });

    it('should abort when too many redirects occur', async() => {
        const loop = (url) => ({
            ok: false, status: 302, statusText: 'Found',
            headers: { get: (name) => name.toLowerCase() === 'location' ? 'https://loop.example.com/again.zip' : null },
            url,
            arrayBuffer: async() => Buffer.alloc(0)
        });
        await expect(downloadPluginArchive('https://loop.example.com/start.zip', {
            maxRedirects: 5,
            timeoutMs: 2000,
            skipDnsCheck: true,
            fetchImpl: async(url) => loop(url)
        })).rejects.toThrow(/redirect/i);
    });

    it('should abort on timeout', async() => {
        await expect(downloadPluginArchive('https://slow.example.com/s.zip', {
            maxBytes: 1024,
            timeoutMs: 100,
            skipDnsCheck: true,
            fetchImpl: async(url, { signal }) => new Promise((_, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason));
            })
        })).rejects.toThrow();
    });

    it('should accept an archive matching the expected sha256', async() => {
        const chunk = Buffer.alloc(1024, 0x61);
        const crypto = await import('node:crypto');
        const hash = crypto.createHash('sha256').update(chunk).digest('hex');

        const result = await downloadPluginArchive('https://hash.example.com/m.zip', {
            maxBytes: 1024 * 1024,
            timeoutMs: 2000,
            skipDnsCheck: true,
            expectedSha256: hash,
            fetchImpl: async() => ({
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => 'application/zip' },
                url: 'https://hash.example.com/m.zip',
                arrayBuffer: async() => chunk
            })
        });

        expect(result.buffer.length).toBe(1024);
    });

    it('should reject an archive not matching the expected sha256', async() => {
        await expect(downloadPluginArchive('https://hash.example.com/m.zip', {
            maxBytes: 1024 * 1024,
            timeoutMs: 2000,
            skipDnsCheck: true,
            expectedSha256: '00'.repeat(32),
            fetchImpl: async() => ({
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => 'application/zip' },
                url: 'https://hash.example.com/m.zip',
                arrayBuffer: async() => Buffer.alloc(1024, 0x61)
            })
        })).rejects.toThrow(/hash mismatch/i);
    });
});
