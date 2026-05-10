import { existsSync, rmSync } from 'fs';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync } from 'fs';

export async function downloadAndExtractPlugin(url, destDir) {
  if (!url) throw new Error('No download URL provided');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

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
    if (entry.isDirectory) continue;
    const relativePath = entry.entryName.startsWith(commonPrefix)
      ? entry.entryName.slice(commonPrefix.length)
      : entry.entryName;
    if (!relativePath) continue;
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
  if (paths.length === 0) return '';
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
