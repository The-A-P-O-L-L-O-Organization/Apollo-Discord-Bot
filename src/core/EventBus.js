export default class EventBus {
  constructor() {
    this._handlers = new Map();
    this._apis = new Map();
    this._apiOwners = new Map();
    this._state = new Map();
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

  provideState(key, defaultValue, pluginId) {
    if (this._state.has(key)) {
      throw new Error(`State key "${key}" is already registered`);
    }
    this._state.set(key, { value: defaultValue, watchers: new Set(), owner: pluginId });
  }

  getState(key) {
    const entry = this._state.get(key);
    return entry ? entry.value : undefined;
  }

  setState(key, value) {
    const entry = this._state.get(key);
    if (!entry) throw new Error(`Unknown state key: "${key}"`);
    const oldValue = entry.value;
    entry.value = value;
    for (const w of entry.watchers) {
      try {
        w.fn(value, oldValue);
      } catch (err) {
        console.error(`[EventBus] Error in state watcher for "${key}":`, err);
      }
    }
  }

  watchState(key, fn, pluginId) {
    const entry = this._state.get(key);
    if (!entry) throw new Error(`Unknown state key: "${key}"`);
    const watcher = { fn, pluginId };
    entry.watchers.add(watcher);
    return () => { entry.watchers.delete(watcher); };
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
    for (const [key, entry] of this._state) {
      if (entry.owner === pluginId) {
        this._state.delete(key);
      } else {
        for (const w of entry.watchers) {
          if (w.pluginId === pluginId) entry.watchers.delete(w);
        }
      }
    }
  }
}
