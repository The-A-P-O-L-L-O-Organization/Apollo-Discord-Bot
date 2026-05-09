export default class EventBus {
  constructor() {
    this._handlers = new Map();
    this._apis = new Map();
    this._apiOwners = new Map();
    this._state = new Map();
    this._redisPub = null;
    this._redisSub = null;
    this._podId = null;
    this._crossPodEnabled = false;
  }

  on(event, handler, pluginId) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    const entry = { handler, pluginId };
    const set = this._handlers.get(event);
    set.add(entry);

    if (this._crossPodEnabled && set.size === 1) {
      this._redisSub.subscribe(`apollo:event:${event}`).catch(err => {
        console.error(`[EventBus] Failed to subscribe to ${event}:`, err.message);
      });
    }

    return () => {
      if (set.has(entry)) {
        set.delete(entry);
        if (this._crossPodEnabled && set.size === 0) {
          this._redisSub.unsubscribe(`apollo:event:${event}`).catch(() => {});
        }
      }
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

    if (this._crossPodEnabled && set.size > 0) {
      const message = JSON.stringify({
        _sourcePodId: this._podId,
        _event: event,
        payload,
      });
      try {
        await this._redisPub.publish(`apollo:event:${event}`, message);
      } catch (err) {
        console.error('[EventBus] Failed to publish cross-pod event:', err.message);
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

    if (this._crossPodEnabled) {
      const message = JSON.stringify({
        _sourcePodId: this._podId,
        _stateKey: key,
        _stateValue: value,
      });
      try {
        this._redisPub.publish(`apollo:state:${key}`, message).catch(err => {
          console.error('[EventBus] Failed to publish cross-pod state:', err.message);
        });
      } catch (err) {
        console.error('[EventBus] Failed to publish cross-pod state:', err.message);
      }
    }
  }

  watchState(key, fn, pluginId) {
    const entry = this._state.get(key);
    if (!entry) throw new Error(`Unknown state key: "${key}"`);
    const watcher = { fn, pluginId };
    const wasEmpty = entry.watchers.size === 0;
    entry.watchers.add(watcher);

    if (this._crossPodEnabled && wasEmpty) {
      this._redisSub.subscribe(`apollo:state:${key}`).catch(err => {
        console.error(`[EventBus] Failed to subscribe to state ${key}:`, err.message);
      });
    }

    return () => {
      entry.watchers.delete(watcher);
      if (this._crossPodEnabled && entry.watchers.size === 0) {
        this._redisSub.unsubscribe(`apollo:state:${key}`).catch(() => {});
      }
    };
  }

  removeAll(pluginId) {
    if (this._crossPodEnabled) {
      for (const [event, set] of this._handlers) {
        for (const entry of set) {
          if (entry.pluginId === pluginId) {
            set.delete(entry);
            if (set.size === 0) {
              this._redisSub.unsubscribe(`apollo:event:${event}`).catch(() => {});
            }
          }
        }
      }
    } else {
      for (const [, set] of this._handlers) {
        for (const entry of set) {
          if (entry.pluginId === pluginId) set.delete(entry);
        }
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

  enableCrossPod(pubClient, subClient, podId) {
    this._redisPub = pubClient;
    this._redisSub = subClient;
    this._podId = podId;
    this._crossPodEnabled = true;

    this._redisSub.on('message', (channel, message) => {
      this._handleCrossPodMessage(channel, message);
    });
  }

  _handleCrossPodMessage(channel, message) {
    try {
      const data = JSON.parse(message);
      if (data._sourcePodId === this._podId) return;

      if (data._event) {
        const set = this._handlers.get(data._event);
        if (set) {
          for (const entry of set) {
            entry.handler(data.payload);
          }
        }
      }

      if (data._stateKey !== undefined) {
        const entry = this._state.get(data._stateKey);
        if (entry && data._stateValue !== entry.value) {
          const oldValue = entry.value;
          entry.value = data._stateValue;
          for (const w of entry.watchers) {
            try {
              w.fn(data._stateValue, oldValue);
            } catch (err) {
              console.error(`[EventBus] Error in cross-pod state watcher for "${data._stateKey}":`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error('[EventBus] Error handling cross-pod message:', err.message);
    }
  }
}
