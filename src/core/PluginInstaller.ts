import type { ParsedPluginManifest as PluginManifest } from './worker/pluginManifest.js';
import type { ArchiveManifest } from './worker/pluginManifest.js';
import { parsePluginManifest } from './worker/pluginManifest.js';
import { join, relative, sep } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifySigstoreSignature, SigstoreVerificationError } from './pluginSigstore.js';

export type { ArchiveManifest } from './worker/pluginManifest.js';

export interface ArchiveIntegrityResult {
    valid: boolean;
    errors: string[];
}

export function verifyArchiveIntegrity(
    pluginDir: string,
    manifest: ArchiveManifest
): ArchiveIntegrityResult {
    const errors: string[] = [];
    for (const [filePath, expectedHash] of Object.entries(manifest.files)) {
        const fullPath = join(pluginDir, filePath);
        if (!existsSync(fullPath)) {
            errors.push(`Missing file: ${filePath}`);
            continue;
        }
        const hash = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
        if (hash !== expectedHash) {
            errors.push(`Hash mismatch for ${filePath}: expected ${expectedHash}, got ${hash}`);
        }
    }
    const pluginJsonPath = join(pluginDir, 'plugin.json');
    if (existsSync(pluginJsonPath)) {
        let pluginJson: Record<string, unknown>;
        try {
            pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8')) as Record<string, unknown>;
        } catch {
            return { valid: false, errors: [...errors, 'plugin.json is not valid JSON'] };
        }
        if (pluginJson['id'] !== manifest.pluginId) {
            errors.push(`plugin.json id mismatch: ${String(pluginJson['id'])} vs ${manifest.pluginId}`);
        }
        const manifestCaps = new Set(manifest.capabilities ?? []);
        const caps = pluginJson['capabilities'];
        if (Array.isArray(caps)) {
            for (const cap of caps as unknown[]) {
                if (typeof cap === 'string' && !manifestCaps.has(cap)) {
                    errors.push(`Plugin requests undeclared capability: ${cap}`);
                }
            }
        }
    }
    return { valid: errors.length === 0, errors };
}

export interface PluginInstallerOptions {
    baseDir: string;
    sigstore?: {
        publicKey: string;
        bundleUrlBase: string;
    };
}

export class PluginInstaller {
    private baseDir: string;
    private sigstore?: {
        publicKey: string;
        bundleUrlBase: string;
    };

    constructor(options: PluginInstallerOptions) {
        this.baseDir = options.baseDir;
        this.sigstore = options.sigstore;
    }

    async install(sourcePath: string, pluginId: string): Promise<PluginManifest> {
        const targetDir = join(process.cwd(), this.baseDir, pluginId);
        if (existsSync(targetDir)) {
            throw new Error(`Plugin ${pluginId} already exists at ${targetDir}`);
        }

        // Copy plugin source
        mkdirSync(targetDir, { recursive: true });
        cpSync(sourcePath, targetDir, { recursive: true });

        // Verify sigstore signature if configured
        if (this.sigstore) {
            const pluginFilePath = join(targetDir, 'plugin.ts');
            const bundleUrl = `${this.sigstore.bundleUrlBase}/${pluginId}.sigstore.json`;

            try {
                await verifySigstoreSignature({
                    artifactPath: pluginFilePath,
                    bundleUrl,
                    publicKey: this.sigstore.publicKey
                });
            } catch (err) {
                // Clean up on verification failure
                rmSync(targetDir, { recursive: true, force: true });
                if (err instanceof SigstoreVerificationError) {
                    throw err;
                }
                throw new SigstoreVerificationError(`Sigstore verification failed: ${err instanceof Error ? err.message : String(err)}`, 'INSTALL_VERIFICATION_FAILED');
            }
        }

        // Parse and verify manifest
        const manifest = await parsePluginManifest({ dir: targetDir });

        // Update plugin-manifest.json with hash
        this.updateGlobalManifest(pluginId, targetDir);

        return manifest;
    }

    uninstall(pluginId: string): Promise<void> {
        const targetDir = join(process.cwd(), this.baseDir, pluginId);
        if (!existsSync(targetDir)) {
            throw new Error(`Plugin ${pluginId} not found at ${targetDir}`);
        }

        // Remove from global manifest
        this.removeFromGlobalManifest(pluginId, targetDir);

        // Delete plugin directory
        rmSync(targetDir, { recursive: true, force: true });

        return Promise.resolve();
    }

    private updateGlobalManifest(pluginId: string, pluginDir: string): void {
        const manifestPath = join(process.cwd(), 'plugin-manifest.json');
        let globalManifest: Record<string, string> = {};

        if (existsSync(manifestPath)) {
            globalManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        }

        // Hash plugin.ts
        const pluginPath = join(pluginDir, 'plugin.ts');
        if (existsSync(pluginPath)) {
            const content = readFileSync(pluginPath, 'utf8');
            const hash = createHash('sha256').update(content).digest('hex');
            const relPath = relative(process.cwd(), pluginPath).split(sep).join('/');
            globalManifest[relPath] = hash;
            writeFileSync(manifestPath, JSON.stringify(globalManifest, null, 4));
        }
    }

    private removeFromGlobalManifest(pluginId: string, pluginDir: string): void {
        const manifestPath = join(process.cwd(), 'plugin-manifest.json');
        if (!existsSync(manifestPath)) {
            return;
        }

        const globalManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const pluginPath = join(pluginDir, 'plugin.ts');
        const relPath = relative(process.cwd(), pluginPath).split(sep).join('/');

        delete globalManifest[relPath];
        writeFileSync(manifestPath, JSON.stringify(globalManifest, null, 4));
    }
}
