/**
 * Helper function to escape characters for safe RegExp construction.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks whether a cache key corresponds to a given file specification, filename, or stem.
 *
 * @param {string} key - Cache key to inspect
 * @param {string} fileSpec - The target file argument (e.g. 'dirt.svg', 'textures/dirt.svg')
 * @param {string} fname - Base filename (e.g. 'dirt.svg')
 * @param {string} stem - Filename stem without extension (e.g. 'dirt')
 * @returns {boolean} True if key matches
 */
function matchesKey(key, fileSpec, fname, stem) {
  const lowerKey = key.toLowerCase();
  const lowerSpec = fileSpec.toLowerCase();
  if (lowerKey.includes(lowerSpec)) return true;
  if (fname && lowerKey.includes(fname)) return true;
  if (stem) {
    const regex = new RegExp(`(^|[/_?&])${escapeRegex(stem)}(\\.[a-z0-9]+|(?=[?&])|$)`, "i");
    if (regex.test(lowerKey)) return true;
  }
  return false;
}

/**
 * Invalidates texture cache entries for modified textures and returns updated cache-bust state.
 *
 * @param {Map|object|null|undefined} cache - Texture cache instance (Map or plain object)
 * @param {string|string[]|null|undefined} changedFile - Specific file(s) changed, or null/empty to clear all
 * @param {number} [newTimestamp=Date.now()] - Timestamp to assign as cacheBustTimestamp
 * @returns {{ invalidatedCount: number, timestamp: number, cacheBustTimestamp: number, valueOf: () => number, toString: () => string }}
 */
export function invalidateTextureCache(cache, changedFile, newTimestamp = Date.now()) {
  let count = 0;

  if (!cache) {
    return {
      invalidatedCount: 0,
      timestamp: newTimestamp,
      cacheBustTimestamp: newTimestamp,
      valueOf: () => newTimestamp,
      toString: () => String(newTimestamp)
    };
  }

  // Clear all if no specific file is requested or wildcard is used
  if (!changedFile || changedFile === "*") {
    if (cache instanceof Map || typeof cache.clear === "function") {
      count = cache.size ?? 0;
      cache.clear();
    } else if (typeof cache === "object") {
      const keys = Object.keys(cache);
      count = keys.length;
      for (const k of keys) {
        delete cache[k];
      }
    }

    return {
      invalidatedCount: count,
      timestamp: newTimestamp,
      cacheBustTimestamp: newTimestamp,
      valueOf: () => newTimestamp,
      toString: () => String(newTimestamp)
    };
  }

  const files = Array.isArray(changedFile) ? changedFile : [changedFile];

  if (cache instanceof Map || typeof cache.keys === "function") {
    const toDelete = [];
    for (const key of cache.keys()) {
      if (typeof key !== "string") continue;
      for (const f of files) {
        if (!f || typeof f !== "string") continue;
        const fname = f.split(/[/\\]/).pop().toLowerCase();
        const extIdx = fname.lastIndexOf(".");
        const stem = extIdx > 0 ? fname.slice(0, extIdx) : fname;
        if (matchesKey(key, f, fname, stem)) {
          toDelete.push(key);
          break;
        }
      }
    }

    for (const k of toDelete) {
      cache.delete(k);
      count++;
    }
  } else if (typeof cache === "object") {
    const toDelete = [];
    for (const key of Object.keys(cache)) {
      for (const f of files) {
        if (!f || typeof f !== "string") continue;
        const fname = f.split(/[/\\]/).pop().toLowerCase();
        const extIdx = fname.lastIndexOf(".");
        const stem = extIdx > 0 ? fname.slice(0, extIdx) : fname;
        if (matchesKey(key, f, fname, stem)) {
          toDelete.push(key);
          break;
        }
      }
    }

    for (const k of toDelete) {
      delete cache[k];
      count++;
    }
  }

  return {
    invalidatedCount: count,
    timestamp: newTimestamp,
    cacheBustTimestamp: newTimestamp,
    valueOf: () => newTimestamp,
    toString: () => String(newTimestamp)
  };
}

/**
 * Client-side Server-Sent Events (SSE) listener for live texture synchronization.
 */
export class LiveSyncClient {
  /**
   * @param {object} [options={}]
   * @param {string} [options.url='/api/events'] - SSE endpoint URL
   * @param {typeof EventSource} [options.EventSource] - Custom EventSource constructor for DI/mocking
   * @param {boolean} [options.autoReconnect=true] - Whether to automatically reconnect on disconnect/error
   * @param {number} [options.reconnectDelay=1000] - Initial reconnection delay in milliseconds
   * @param {number} [options.maxReconnectDelay=10000] - Maximum reconnection delay in milliseconds
   * @param {number} [options.backoffMultiplier=1.5] - Exponential backoff multiplier
   */
  constructor(options = {}) {
    this.url = options.url || "/api/events";
    this.EventSourceClass = options.EventSource || (typeof EventSource !== "undefined" ? EventSource : null);
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 10000;
    this.backoffMultiplier = options.backoffMultiplier ?? 1.5;

    this._status = "disconnected"; // 'connecting' | 'connected' | 'disconnected' | 'error'
    this._currentReconnectDelay = this.reconnectDelay;
    this._reconnectTimer = null;
    this._manualClose = false;
    this._listeners = new Map();
    this.eventSource = null;
  }

  /**
   * Current connection status.
   * @returns {'connecting'|'connected'|'disconnected'|'error'}
   */
  get status() {
    return this._status;
  }

  /**
   * Updates internal status and emits status event if changed.
   * @private
   */
  _setStatus(newStatus) {
    if (this._status === newStatus) return;
    const prev = this._status;
    this._status = newStatus;
    this.emit("status", { status: newStatus, previous: prev });
  }

  /**
   * Adds an event listener.
   *
   * @param {string} event - Event name ('open', 'message', 'change', 'reload', 'error', 'status', 'close')
   * @param {Function} handler - Callback function
   * @returns {() => void} Unsubscribe function
   */
  on(event, handler) {
    if (typeof handler !== "function") return () => {};
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Removes an event listener.
   *
   * @param {string} event
   * @param {Function} handler
   * @returns {LiveSyncClient}
   */
  off(event, handler) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(handler);
    }
    return this;
  }

  /**
   * Emits an event to registered listeners.
   *
   * @param {string} event
   * @param {...*} args
   */
  emit(event, ...args) {
    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const fn of Array.from(handlers)) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[LiveSyncClient] Error in listener for "${event}":`, err);
      }
    }
  }

  /**
   * Establishes SSE connection to the server.
   *
   * @returns {LiveSyncClient}
   */
  connect() {
    if (this._status === "connected" || this._status === "connecting") {
      return this;
    }

    this._manualClose = false;
    this._clearReconnectTimer();

    if (!this.EventSourceClass) {
      this._setStatus("error");
      const err = new Error("EventSource implementation is not available");
      this.emit("error", err);
      return this;
    }

    this._setStatus("connecting");

    try {
      const es = new this.EventSourceClass(this.url);
      this.eventSource = es;

      es.onopen = (event) => {
        this._setStatus("connected");
        this._currentReconnectDelay = this.reconnectDelay;
        this.emit("open", event);
      };

      es.onerror = (error) => {
        if (this._status !== "disconnected") {
          this._setStatus("error");
          this.emit("error", error);
          if (this.autoReconnect && !this._manualClose) {
            this._scheduleReconnect();
          }
        }
      };

      es.onmessage = (event) => {
        let data = event.data;
        if (typeof event.data === "string") {
          try {
            data = JSON.parse(event.data);
          } catch {}
        }
        this.emit("message", data, event);
        if (data && typeof data === "object" && data.type) {
          this.emit(data.type, data, event);
        }
      };

      if (typeof es.addEventListener === "function") {
        es.addEventListener("change", (event) => {
          let data = event.data;
          if (typeof event.data === "string") {
            try {
              data = JSON.parse(event.data);
            } catch {}
          }
          this.emit("change", data, event);
        });

        es.addEventListener("reload", (event) => {
          let data = event.data;
          if (typeof event.data === "string") {
            try {
              data = JSON.parse(event.data);
            } catch {}
          }
          this.emit("reload", data, event);
        });
      }
    } catch (err) {
      this._setStatus("error");
      this.emit("error", err);
      if (this.autoReconnect && !this._manualClose) {
        this._scheduleReconnect();
      }
    }

    return this;
  }

  /**
   * Schedules a reconnection attempt using exponential backoff.
   * @private
   */
  _scheduleReconnect() {
    if (this._reconnectTimer || this._manualClose) return;

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }

    const delay = this._currentReconnectDelay;
    this._currentReconnectDelay = Math.min(
      this._currentReconnectDelay * this.backoffMultiplier,
      this.maxReconnectDelay
    );

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._manualClose && this._status !== "connected") {
        this.connect();
      }
    }, delay);

    if (this._reconnectTimer && typeof this._reconnectTimer.unref === "function") {
      this._reconnectTimer.unref();
    }
  }

  /**
   * Clears active reconnection timer if present.
   * @private
   */
  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * Closes the SSE connection and stops automatic reconnection.
   */
  disconnect() {
    this.close();
  }

  /**
   * Closes the SSE connection and stops automatic reconnection.
   */
  close() {
    this._manualClose = true;
    this._clearReconnectTimer();

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }

    this._setStatus("disconnected");
    this.emit("close");
  }
}

/**
 * Creates and returns a new LiveSyncClient instance.
 *
 * @param {object} [options]
 * @returns {LiveSyncClient}
 */
export function createLiveSyncClient(options) {
  return new LiveSyncClient(options);
}

/**
 * Binds LiveSync listener to a TextureStudioApp instance, updating cache-bust timestamp,
 * invalidating texture caches, and triggering 3D viewport re-rendering upon reload events.
 *
 * @param {object} app - TextureStudioApp instance
 * @param {object} [options={}] - Configuration options
 * @param {LiveSyncClient} [options.client] - Existing LiveSyncClient instance
 * @param {boolean} [options.partialInvalidation=false] - Invalidate only changed files instead of clearing entire cache
 * @param {boolean} [options.autoConnect=true] - Automatically establish connection
 * @param {Function} [options.onReload] - Callback invoked when reload event triggers
 * @returns {LiveSyncClient} Active client with .detach() helper
 */
export function attachLiveSync(app, options = {}) {
  const client = options.client || new LiveSyncClient(options);

  const handleUpdate = (data) => {
    const newTimestamp = options.timestamp || Date.now();
    if (app) {
      app.cacheBustTimestamp = newTimestamp;
      if (app.textureCache) {
        if (options.partialInvalidation && data && data.filename) {
          invalidateTextureCache(app.textureCache, data.filename, newTimestamp);
        } else if (typeof app.textureCache.clear === "function") {
          app.textureCache.clear();
        } else {
          invalidateTextureCache(app.textureCache, null, newTimestamp);
        }
      }
      if (typeof app.render3DObjects === "function") {
        app.render3DObjects();
      }
    }
    if (typeof options.onReload === "function") {
      options.onReload(data);
    }
  };

  const unsubChange = client.on("change", handleUpdate);
  const unsubReload = client.on("reload", handleUpdate);

  client.detach = () => {
    unsubChange();
    unsubReload();
    client.disconnect();
  };
  client.client = client;

  if (options.autoConnect !== false) {
    client.connect();
  }

  return client;
}