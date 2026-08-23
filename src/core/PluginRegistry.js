import { logger } from '../utils/logger.js';
 
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DEFAULT_PLUGINS = [
    {
        id: 'ssa',
        name: 'SSA',
        version: '1.0.0',
        description: 'Channel revival ping plugin. Pings a role when a monitored channel receives a message after a configurable period of silence.',
        downloadUrl: 'https://github.com/The-A-P-O-L-L-O-Organization/ssa-apollo-plugin/releases/download/v1.0.0/ssa-plugin.zip'
    }
];

export default class PluginRegistry {
    constructor(filePath) {
        this._filePath = filePath;
        this._plugins = [];
        this._load();
    }

    _load() {
        if (!existsSync(this._filePath)) {
            this._initDefault();
            return;
        }
        try {
            const raw = readFileSync(this._filePath, 'utf-8');
            const data = JSON.parse(raw);
            this._plugins = data.plugins || [];
        } catch (err) {
            logger.error('[PluginRegistry] Failed to load, using defaults:', err.message);
            this._plugins = [...DEFAULT_PLUGINS];
        }
    }

    _initDefault() {
        this._plugins = [...DEFAULT_PLUGINS];
        try {
            mkdirSync(dirname(this._filePath), { recursive: true });
            writeFileSync(this._filePath, JSON.stringify({ plugins: DEFAULT_PLUGINS }, null, 2), 'utf-8');
            logger.info('[PluginRegistry] Created default registry at', this._filePath);
        } catch (err) {
            logger.error('[PluginRegistry] Failed to create default registry:', err.message);
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
