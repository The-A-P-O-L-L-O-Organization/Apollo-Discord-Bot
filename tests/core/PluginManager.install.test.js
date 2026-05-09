import { describe, it, expect, beforeEach, vi } from 'vitest';
import PluginManager from '../../src/core/PluginManager.js';
import EventBus from '../../src/core/EventBus.js';
import Plugin from '../../src/core/Plugin.js';

class SamplePlugin extends Plugin {
  static id = 'sample';
  static dependencies = [];
  onLoad = vi.fn();
  onUnload = vi.fn();
  onEnable = vi.fn();
  onDisable = vi.fn();
}

describe('PluginManager install/uninstall', () => {
  let manager;
  let client;
  let bus;

  beforeEach(() => {
    client = { commands: new Map(), config: { plugins: { enabled: [], directory: './src/plugins', optionalDirectory: './data/plugins', registryFile: './data/plugin-registry.json' }, CLIENT_ID: '123' }, on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), rest: { put: vi.fn() } };
    bus = new EventBus();
    manager = new PluginManager(client, bus);
    manager._pluginRegistry.set('sample', SamplePlugin);
  });

  it('should track plugin origin', () => {
    expect(manager.installedPlugins).toBeDefined();
    expect(manager.installedPlugins instanceof Map).toBe(true);
  });

  it('should be able to load plugin and record as built-in', async () => {
    await manager.loadPlugin('sample');
    const info = manager.installedPlugins.get('sample');
    expect(info).toBeDefined();
    expect(info.origin).toBe('built-in');
  });
});
