import { readdirSync, existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Routes } from 'discord.js';

export default class PluginManager {
  constructor(client, bus) {
    this.client = client;
    this.bus = bus;
    this.plugins = new Map();
    this._pluginRegistry = new Map();
    this.config = null;
  }

  async loadAll(config) {
    this.config = config;
    const { enabled, directory } = config.plugins;
    for (const id of enabled) {
      await this.loadPlugin(id, directory);
    }
    const sorted = this._sortByDependencies(enabled);
    for (const id of sorted) {
      await this.enablePlugin(id);
    }
    await this._syncDiscordCommands();
  }

  _sortByDependencies(ids) {
    const idSet = new Set(ids);
    const visited = new Set();
    const sorted = [];

    function visit(id, graph, path) {
      if (path.has(id)) throw new Error(`Circular dependency detected: ${[...path, id].join(' -> ')}`);
      if (visited.has(id)) return;
      visited.add(id);
      path.add(id);
      for (const dep of graph.get(id) || []) {
        if (idSet.has(dep)) visit(dep, graph, path);
      }
      path.delete(id);
      sorted.push(id);
    }

    const graph = new Map();
    for (const id of ids) {
      const PluginClass = this._pluginRegistry.get(id);
      graph.set(id, PluginClass ? PluginClass.dependencies : []);
    }

    for (const id of ids) {
      visit(id, graph, new Set());
    }

    return sorted;
  }

  async _syncDiscordCommands() {
    try {
      const commands = [...this.client.commands.values()].map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        options: cmd.options || []
      }));
      const rest = this.client.rest;
      const { CLIENT_ID } = this.client.config;
      if (!CLIENT_ID) return;
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
    } catch (error) {
      console.error('[ERROR] Failed to sync commands with Discord:', error);
    }
  }

  async loadPlugin(id, baseDir = './src/plugins') {
    if (this.plugins.has(id)) return this.plugins.get(id);

    let PluginClass = this._pluginRegistry.get(id);
    if (!PluginClass) {
      const pluginDir = path.join(process.cwd(), baseDir, id);
      const pluginPath = path.join(pluginDir, 'plugin.js');
      if (!existsSync(pluginPath)) throw new Error(`Plugin ${id} not found at ${pluginPath}`);

      const url = pathToFileURL(pluginPath).href + `?t=${Date.now()}`;
      const mod = await import(url);
      PluginClass = mod.default;
      this._pluginRegistry.set(id, PluginClass);
    }

    const plugin = new PluginClass(this.client, this);
    plugin.setDirectory(path.join(process.cwd(), baseDir, id));
    await plugin.onLoad();
    plugin._loaded = true;
    this.plugins.set(id, plugin);
    return plugin;
  }

  async unloadPlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin ${id} not loaded`);
    if (plugin._enabled) throw new Error(`Disable plugin ${id} before unloading`);
    await plugin.onUnload();
    plugin._loaded = false;
    this.plugins.delete(id);
  }

  async enablePlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin ${id} not loaded`);
    if (plugin._enabled) return;

    for (const depId of plugin.constructor.dependencies) {
      const dep = this.plugins.get(depId);
      if (!dep || !dep._enabled) {
        throw new Error(`Dependency ${depId} not enabled for plugin ${id}`);
      }
    }

    this.bus.removeAll(id);
    await plugin.onEnable();
    plugin._enabled = true;
  }

  async disablePlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin ${id} not loaded`);
    if (!plugin._enabled) return;
    await plugin.onDisable();
    this.bus.removeAll(id);
    plugin._enabled = false;
  }

  async reloadPlugin(id) {
    await this.disablePlugin(id);
    await this.unloadPlugin(id);
    this._pluginRegistry.delete(id);
    await this.loadPlugin(id, this.config?.plugins?.directory);
    await this.enablePlugin(id);
  }

  getPlugin(id) { return this.plugins.get(id) || null; }

  isEnabled(id) {
    const p = this.plugins.get(id);
    return p ? p._enabled : false;
  }

  listPlugins() {
    return [...this.plugins.entries()].map(([id, p]) => ({
      id,
      version: p.constructor.version,
      loaded: p._loaded,
      enabled: p._enabled,
    }));
  }

  scanPlugins(baseDir = './src/plugins') {
    const absDir = path.join(process.cwd(), baseDir);
    if (!existsSync(absDir)) return [];
    return readdirSync(absDir).filter(name => {
      return existsSync(path.join(absDir, name, 'plugin.js'));
    });
  }
}
