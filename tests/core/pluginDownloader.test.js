import { describe, it, expect } from 'vitest';
import { isAllowedProtocol, isPrivateIp, validatePluginDirectory } from '../../src/core/pluginDownloader.js';
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
        expect(isPrivateIp('fe80::1')).toBe(true);
    });

    it('should allow only https protocol', () => {
        expect(isAllowedProtocol('https:')).toBe(true);
        expect(isAllowedProtocol('http:')).toBe(false);
        expect(isAllowedProtocol('file:')).toBe(false);
    });
});
