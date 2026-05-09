export default class EventBus {
  constructor() {
    this._handlers = new Map();
    this._apis = new Map();
    this._apiOwners = new Map();
  }

  on(event, handler, pluginId) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    const entry = { handler, pluginId };
    this._handlers.get(event).add(entry);
    return () => {
      const set = this._handlers.get(event);
      if (set) set.delete(entry);
    };
  }

  once(event, handler, pluginId) {
    const wrapped = async (payload) => {
      try {
        await handler(payload);
      } finally {
        const set = this._handlers.get(event);
        if (set) {
          for (const entry of set) {
            if (entry.handler === wrapped) { set.delete(entry); break; }
          }
        }
      }
    };
    return this.on(event, wrapped, pluginId);
  }

  async emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    const entries = [...set];
    for (const entry of entries) {
      if (!this._handlers.has(event) || !this._handlers.get(event).has(entry)) continue;
      try {
        await entry.handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  provide(namespace, fn, pluginId) {
    if (this._apis.has(namespace)) {
      throw new Error(`API "${namespace}" is already registered`);
    }
    this._apis.set(namespace, fn);
    this._apiOwners.set(namespace, pluginId);
  }

  async call(namespace, ...args) {
    const fn = this._apis.get(namespace);
    if (!fn) throw new Error(`Unknown API: "${namespace}"`);
    return fn(...args);
  }

  removeAll(pluginId) {
    for (const [, set] of this._handlers) {
      for (const entry of set) {
        if (entry.pluginId === pluginId) set.delete(entry);
      }
    }
    for (const [ns, pid] of this._apiOwners) {
      if (pid === pluginId) {
        this._apis.delete(ns);
        this._apiOwners.delete(ns);
      }
    }
  }
}
