import { describe, it, expect, beforeEach } from 'vitest';
import PluginRegistry from '../../src/core/PluginRegistry.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('PluginRegistry', () => {
  let registry;
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plugin-reg-test-'));
    const manifest = {
      plugins: [
        { id: 'voice-mod', name: 'Voice Mod', version: '1.0.0', downloadUrl: 'https://example.com/vm.zip' },
        { id: 'leveling', name: 'Leveling', version: '2.1.0', downloadUrl: 'https://example.com/lvl.zip' }
      ]
    };
    writeFileSync(join(tmpDir, 'plugin-registry.json'), JSON.stringify(manifest));
    registry = new PluginRegistry(join(tmpDir, 'plugin-registry.json'));
  });

  it('should load and list available plugins', () => {
    const available = registry.listAvailable();
    expect(available).toHaveLength(2);
    expect(available[0].id).toBe('voice-mod');
  });

  it('should find a plugin by id', () => {
    const plugin = registry.get('voice-mod');
    expect(plugin).toBeTruthy();
    expect(plugin.downloadUrl).toBe('https://example.com/vm.zip');
  });

  it('should return null for unknown plugin', () => {
    expect(registry.get('nonexistent')).toBeNull();
  });

  it('should search plugins by query', () => {
    const results = registry.search('voice');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('voice-mod');
  });
});
