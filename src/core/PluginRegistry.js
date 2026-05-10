import { readFileSync, existsSync } from 'fs';

export default class PluginRegistry {
  constructor(filePath) {
    this._filePath = filePath;
    this._plugins = [];
    this._load();
  }

  _load() {
    if (!existsSync(this._filePath)) return;
    try {
      const raw = readFileSync(this._filePath, 'utf-8');
      const data = JSON.parse(raw);
      this._plugins = data.plugins || [];
    } catch (err) {
      console.error('[PluginRegistry] Failed to load:', err.message);
    }
  }

  listAvailable() {
    return [...this._plugins];
  }

  get(id) {
    return this._plugins.find(p => p.id === id) || null;
  }

  search(query) {
    const lower = query.toLowerCase();
    return this._plugins.filter(p =>
      p.id.toLowerCase().includes(lower) ||
      (p.name && p.name.toLowerCase().includes(lower)) ||
      (p.description && p.description.toLowerCase().includes(lower))
    );
  }

  reload() {
    this._plugins = [];
    this._load();
  }
}
