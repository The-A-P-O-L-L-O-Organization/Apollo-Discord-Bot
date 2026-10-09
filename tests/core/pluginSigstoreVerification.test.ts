import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installPlugin } from '../../src/core/pluginDownloader.js';
import type { RegistryEntry } from '../../src/core/pluginDownloader.js';
import { canonicalizeManifest, generateFileHashes } from '../../src/core/worker/pluginManifest.js';
import type { ArchiveManifest } from '../../src/core/worker/pluginManifest.js';

function writePluginFiles(pluginDir: string, pluginId: string): void {
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
        capabilities: ['api:sendMessage'],
        entry: 'plugin.js',
        id: pluginId
    }));
    writeFileSync(join(pluginDir, 'plugin.js'), `export default class TestPlugin { static id = '${pluginId}'; }`);
}

function signManifest(manifest: ArchiveManifest): { publicKey: string; signatures: { keyid: string; sig: string }[] } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const signer = createSign('sha256');
    signer.update(canonicalizeManifest(manifest));
    signer.end();
    const sig = signer.sign(privateKey, 'base64');
    return { publicKey: publicPem, signatures: [{ keyid: 'test-key', sig }] };
}

describe('plugin sigstore verification', () => {
    const testDir = join(tmpdir(), 'apollo-sigstore-test');

    beforeEach(() => {
        rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
        delete process.env['ALLOW_UNVERIFIED_PLUGINS'];
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
        delete process.env['ALLOW_UNVERIFIED_PLUGINS'];
    });

    it('rejects install when sigstore verification fails', async () => {
        const pluginDir = join(testDir, 'unsigned-plugin');
        writePluginFiles(pluginDir, 'unsigned-test');
        const registryEntry: RegistryEntry = {
            downloadUrl: `file://${pluginDir}`,
            id: 'unsigned-test',
            version: '1.0.0'
        };
        await expect(installPlugin(registryEntry, { verifySignature: true }))
            .rejects.toThrow(/signature|verification/i);
    });

    it('accepts install with valid sigstore signature', async () => {
        const pluginDir = join(testDir, 'signed-plugin');
        writePluginFiles(pluginDir, 'signed-test');
        const manifest: ArchiveManifest = {
            capabilities: ['api:sendMessage'],
            entry: 'plugin.js',
            files: generateFileHashes(pluginDir),
            pluginId: 'signed-test'
        };
        const { publicKey, signatures } = signManifest(manifest);
        const registryEntry: RegistryEntry = {
            downloadUrl: `file://${pluginDir}`,
            id: 'signed-test',
            sigstoreBundle: { manifest, publicKey, signatures },
            version: '1.0.0'
        };
        const result = await installPlugin(registryEntry, { verifySignature: true });
        expect(result.success).toBe(true);
        expect(result.signer).toBe('test-key');
    });

    it('rejects install when archive integrity check fails after valid signature', async () => {
        const pluginDir = join(testDir, 'tampered-plugin');
        writePluginFiles(pluginDir, 'tampered-test');
        const tamperedFiles = { ...generateFileHashes(pluginDir), 'plugin.js': '00'.repeat(32) };
        const tamperedManifest: ArchiveManifest = {
            capabilities: ['api:sendMessage'],
            entry: 'plugin.js',
            files: tamperedFiles,
            pluginId: 'tampered-test'
        };
        const { publicKey, signatures } = signManifest(tamperedManifest);
        const registryEntry: RegistryEntry = {
            downloadUrl: `file://${pluginDir}`,
            id: 'tampered-test',
            sigstoreBundle: { manifest: tamperedManifest, publicKey, signatures },
            version: '1.0.0'
        };
        await expect(installPlugin(registryEntry, { verifySignature: true }))
            .rejects.toThrow(/integrity|hash mismatch/i);
    });

    it('allows unverified install only with ALLOW_UNVERIFIED_PLUGINS=1', async () => {
        process.env['ALLOW_UNVERIFIED_PLUGINS'] = '1';
        try {
            const pluginDir = join(testDir, 'unsigned-test-2');
            writePluginFiles(pluginDir, 'unsigned-test-2');
            const registryEntry: RegistryEntry = {
                downloadUrl: `file://${pluginDir}`,
                id: 'unsigned-test-2',
                version: '1.0.0'
            };
            const result = await installPlugin(registryEntry, { verifySignature: true });
            expect(result.success).toBe(true);
        } finally {
            delete process.env['ALLOW_UNVERIFIED_PLUGINS'];
        }
    });
});
