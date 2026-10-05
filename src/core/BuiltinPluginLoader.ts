import { existsSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { pathToFileURL } from 'url';
import { verifyPluginFile } from '../utils/manifest.js';
import type { Plugin as PluginBase } from './Plugin.js';

export interface BuiltinPluginLoadResult {
    PluginClass: new (...args: unknown[]) => PluginBase;
    pluginDir: string;
}

export class BuiltinPluginLoader {
    async load(id: string, baseDir: string, preferJs: boolean, installedDir: string): Promise<BuiltinPluginLoadResult> {
        const pluginDir = join(process.cwd(), baseDir, id);
        const candidates = preferJs
            ? [join(pluginDir, 'plugin.js'), join(pluginDir, 'plugin.ts')]
            : [join(pluginDir, 'plugin.ts'), join(pluginDir, 'plugin.js')];
        const pluginPath = candidates.find((p) => existsSync(p)) ?? candidates[0]!;
        if (!existsSync(pluginPath)) {
            const optionalDir = join(process.cwd(), installedDir, id);
            const optionalPath = join(optionalDir, 'plugin.ts');
            const optionalPathJs = join(optionalDir, 'plugin.js');
            const optionalCandidates = preferJs ? [optionalPathJs, optionalPath] : [optionalPath, optionalPathJs];
            if (existsSync(optionalCandidates[0]!)) {
                return { PluginClass: await this.importPlugin(id, optionalCandidates[0]!), pluginDir: optionalDir };
            }
            if (existsSync(optionalCandidates[1]!)) {
                return { PluginClass: await this.importPlugin(id, optionalCandidates[1]!), pluginDir: optionalDir };
            }
            throw new Error(`Plugin ${id} not found at ${pluginPath}`);
        }
        return { PluginClass: await this.importPlugin(id, pluginPath), pluginDir };
    }

    private async importPlugin(id: string, pluginPath: string): Promise<new (...args: unknown[]) => PluginBase> {
        const manifestPathGlobal = join(process.cwd(), 'plugin-manifest.json');
        if (existsSync(manifestPathGlobal)) {
            const manifest = JSON.parse(readFileSync(manifestPathGlobal, 'utf8'));
            const relPath = relative(process.cwd(), pluginPath).split(sep).join('/');
            const expectedHash = manifest[relPath] as string | undefined;
            if (expectedHash) {
                verifyPluginFile(pluginPath, expectedHash);
            }
        }

        const url = pathToFileURL(pluginPath).href + (process.env['NODE_ENV'] === 'development' ? `?t=${Date.now()}` : '');
        const mod = await import(url);
        const PluginClass = mod.default;
        if (!PluginClass) {
            throw new Error(`Plugin ${id} does not export a default class`);
        }
        return PluginClass;
    }
}
