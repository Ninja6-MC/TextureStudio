import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createSseHub,
  handleEventsRequest,
  broadcastReload,
  watchTextureDir
} from "../server.mjs";
import {
  LiveSyncClient,
  createLiveSyncClient,
  invalidateTextureCache,
  attachLiveSync
} from "../../src/modules/live-sync.js";

/**
 * Mock EventSource implementation for deterministic unit testing of LiveSyncClient.
 */
class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.readyState = 0; // CONNECTING
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback);
    }
  }

  dispatchEvent(event) {
    if (this.listeners.has(event.type)) {
      for (const cb of this.listeners.get(event.type)) {
        cb(event);
      }
    }
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    if (typeof this.onopen === "function") {
      this.onopen({ type: "open" });
    }
  }

  simulateError(err = new Error("Connection failed")) {
    this.readyState = 2; // CLOSED
    if (typeof this.onerror === "function") {
      this.onerror(err);
    }
  }

  simulateMessage(data) {
    const event = { type: "message", data: typeof data === "string" ? data : JSON.stringify(data) };
    if (typeof this.onmessage === "function") {
      this.onmessage(event);
    }
    this.dispatchEvent(event);
  }

  simulateEvent(type, data) {
    const event = { type, data: typeof data === "string" ? data : JSON.stringify(data) };
    this.dispatchEvent(event);
  }

  close() {
    this.readyState = 2;
    this.closed = true;
  }
}

describe("Server SSE Stream & Route (/api/events)", () => {
  let server;
  let baseUrl;
  let hub;

  before(async () => {
    hub = createSseHub({ keepAliveIntervalMs: 50 });
    server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (urlObj.pathname === "/api/events") {
        handleEventsRequest(req, res, hub);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  });

  test("GET /api/events sets SSE headers, CORS, and initial keep-alive comment", async () => {
    await new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/events`, (res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["content-type"], "text/event-stream");
        assert.equal(res.headers["cache-control"], "no-cache, no-transform");
        assert.equal(res.headers["connection"], "keep-alive");
        assert.equal(res.headers["access-control-allow-origin"], "*");

        res.once("data", (chunk) => {
          const text = chunk.toString();
          assert(text.includes(": keep-alive\n\n"));
          req.destroy();
          resolve();
        });
      });
      req.on("error", reject);
    });
  });

  test("OPTIONS /api/events returns 204 with CORS preflight headers", async () => {
    const res = await fetch(`${baseUrl}/api/events`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert(res.headers.get("access-control-allow-methods").includes("GET"));
  });

  test("POST /api/events returns 405 Method Not Allowed", async () => {
    const res = await fetch(`${baseUrl}/api/events`, { method: "POST" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD, OPTIONS");
  });

  test("HEAD /api/events returns 200 with headers and empty body", async () => {
    const res = await fetch(`${baseUrl}/api/events`, { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const text = await res.text();
    assert.equal(text, "");
  });

  test("Broadcast sends SSE event with correct format to active clients", async () => {
    await new Promise((resolve, reject) => {
      let receivedInitial = false;
      const req = http.get(`${baseUrl}/api/events`, (res) => {
        res.on("data", (chunk) => {
          const text = chunk.toString();
          if (!receivedInitial && text.includes(": keep-alive")) {
            receivedInitial = true;
            // Broadcast reload event once connected
            broadcastReload(hub, { filename: "dirt.svg", stem: "dirt" });
            return;
          }

          if (text.includes("event: change")) {
            assert(text.includes("dirt.svg"));
            assert(text.includes('"stem":"dirt"'));
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
    });
  });

  test("Client disconnect cleanly removes client reference from hub", async () => {
    const testHub = createSseHub();
    const testServer = http.createServer((req, res) => {
      handleEventsRequest(req, res, testHub);
    });

    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    const port = testServer.address().port;

    try {
      assert.equal(testHub.getClientCount(), 0);
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/events`, (res) => {
          res.once("data", () => {
            assert.equal(testHub.getClientCount(), 1);
            req.destroy();

            const start = Date.now();
            const timer = setInterval(() => {
              if (testHub.getClientCount() === 0) {
                clearInterval(timer);
                resolve();
              } else if (Date.now() - start > 1500) {
                clearInterval(timer);
                reject(new Error("Client reference was not removed from hub within timeout"));
              }
            }, 10);
          });
        });
        req.on("error", () => {});
      });
    } finally {
      testHub.close();
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("Periodic keep-alive sends comments across open stream", async () => {
    await new Promise((resolve, reject) => {
      let keepAliveCount = 0;
      const req = http.get(`${baseUrl}/api/events`, (res) => {
        res.on("data", (chunk) => {
          const text = chunk.toString();
          if (text.includes(": keep-alive")) {
            keepAliveCount++;
            if (keepAliveCount >= 2) {
              req.destroy();
              resolve();
            }
          }
        });
      });
      req.on("error", reject);
    });
  });
});

describe("Directory Watcher & Debouncing", () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "texture-studio-watch-test-"));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("Collapses rapid consecutive file writes into single broadcast within 100ms", async () => {
    const broadcasts = [];
    const watcher = watchTextureDir(tempDir, (payload) => {
      broadcasts.push(payload);
    }, 100);

    const testFile = path.join(tempDir, "grass_block_top.svg");

    // Write file 4 times rapidly with 15ms spacing (< 100ms)
    fs.writeFileSync(testFile, "<svg>1</svg>");
    await new Promise((r) => setTimeout(r, 15));
    fs.writeFileSync(testFile, "<svg>2</svg>");
    await new Promise((r) => setTimeout(r, 15));
    fs.writeFileSync(testFile, "<svg>3</svg>");
    await new Promise((r) => setTimeout(r, 15));
    fs.writeFileSync(testFile, "<svg>4</svg>");

    // Wait past debounce threshold
    await new Promise((r) => setTimeout(r, 200));

    watcher.close();

    assert.equal(broadcasts.length, 1, "Should collapse rapid writes into exactly 1 broadcast");
    assert.equal(broadcasts[0].type, "change");
    assert.equal(broadcasts[0].filename, "grass_block_top.svg");
    assert.equal(broadcasts[0].stem, "grass_block_top");
    assert(broadcasts[0].timestamp > 0);
  });

  test("triggerNow executes pending broadcast immediately and clears timer", () => {
    let triggered = 0;
    const watcher = watchTextureDir(tempDir, () => {
      triggered++;
    }, 1000);

    watcher.pendingChanges.add("stone.png");
    watcher.triggerNow();

    assert.equal(triggered, 1);
    watcher.close();
  });
});

describe("LiveSyncClient Module Lifecycle", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  test("Initializes with default options and disconnected status", () => {
    const client = createLiveSyncClient({ EventSource: MockEventSource });
    assert.equal(client.status, "disconnected");
    assert.equal(client.url, "/api/events");
    assert.equal(client.autoReconnect, true);
  });

  test("Connects and transitions status: connecting -> connected", () => {
    const client = new LiveSyncClient({ EventSource: MockEventSource });
    const statuses = [];
    client.on("status", ({ status }) => statuses.push(status));

    client.connect();
    assert.equal(client.status, "connecting");

    const mockEs = MockEventSource.instances[0];
    assert(mockEs);
    mockEs.simulateOpen();

    assert.equal(client.status, "connected");
    assert.deepEqual(statuses, ["connecting", "connected"]);

    client.disconnect();
    assert.equal(client.status, "disconnected");
    assert.equal(mockEs.closed, true);
  });

  test("Dispatches change and reload events correctly to registered listeners", () => {
    const client = new LiveSyncClient({ EventSource: MockEventSource });
    client.connect();

    const mockEs = MockEventSource.instances[0];
    mockEs.simulateOpen();

    let changePayload = null;
    let reloadPayload = null;
    client.on("change", (data) => { changePayload = data; });
    client.on("reload", (data) => { reloadPayload = data; });

    mockEs.simulateEvent("change", { filename: "oak_log.svg", stem: "oak_log" });
    assert.deepEqual(changePayload, { filename: "oak_log.svg", stem: "oak_log" });

    mockEs.simulateEvent("reload", { type: "reload", full: true });
    assert.deepEqual(reloadPayload, { type: "reload", full: true });

    client.disconnect();
  });

  test("Dispatches generic message event and derives typed event", () => {
    const client = new LiveSyncClient({ EventSource: MockEventSource });
    client.connect();

    const mockEs = MockEventSource.instances[0];
    mockEs.simulateOpen();

    let messageData = null;
    let changeData = null;
    client.on("message", (data) => { messageData = data; });
    client.on("change", (data) => { changeData = data; });

    mockEs.simulateMessage({ type: "change", filename: "dirt.svg" });
    assert.equal(messageData.filename, "dirt.svg");
    assert.equal(changeData.filename, "dirt.svg");

    client.disconnect();
  });

  test("Unsubscribing via returned function stops callback execution", () => {
    const client = new LiveSyncClient({ EventSource: MockEventSource });
    client.connect();

    let callCount = 0;
    const unsubscribe = client.on("change", () => { callCount++; });

    const mockEs = MockEventSource.instances[0];
    mockEs.simulateOpen();
    mockEs.simulateEvent("change", { filename: "sand.svg" });
    assert.equal(callCount, 1);

    unsubscribe();
    mockEs.simulateEvent("change", { filename: "sand.svg" });
    assert.equal(callCount, 1);

    client.disconnect();
  });

  test("Reconnects automatically on error with backoff multiplier", async () => {
    const client = new LiveSyncClient({
      EventSource: MockEventSource,
      autoReconnect: true,
      reconnectDelay: 20,
      backoffMultiplier: 2
    });

    client.connect();
    const es1 = MockEventSource.instances[0];
    es1.simulateOpen();
    assert.equal(client.status, "connected");

    // Simulate connection failure
    es1.simulateError(new Error("Network disconnect"));
    assert.equal(client.status, "error");

    // Wait for first reconnect attempt (delay = 20ms)
    await new Promise((r) => setTimeout(r, 45));

    assert.equal(MockEventSource.instances.length, 2);
    const es2 = MockEventSource.instances[1];
    assert.equal(client.status, "connecting");

    es2.simulateOpen();
    assert.equal(client.status, "connected");

    client.disconnect();
    assert.equal(client.status, "disconnected");
  });

  test("Manual disconnect prevents reconnection attempts", async () => {
    const client = new LiveSyncClient({
      EventSource: MockEventSource,
      autoReconnect: true,
      reconnectDelay: 20
    });

    client.connect();
    const es = MockEventSource.instances[0];
    es.simulateOpen();

    client.disconnect();
    assert.equal(client.status, "disconnected");

    // Trigger error on closed ES
    es.simulateError(new Error("Post close error"));
    await new Promise((r) => setTimeout(r, 50));

    // No new instance should be created
    assert.equal(MockEventSource.instances.length, 1);
    assert.equal(client.status, "disconnected");
  });
});

describe("Cache Invalidation Helper (invalidateTextureCache)", () => {
  test("Clears entire cache when no file is specified or wildcard is used", () => {
    const cache = new Map([
      ["textures/dirt.svg?t=100_512", {}],
      ["textures/stone.png?t=100_512", {}]
    ]);

    const res1 = invalidateTextureCache(cache);
    assert.equal(cache.size, 0);
    assert.equal(res1.invalidatedCount, 2);
    assert(res1.timestamp > 0);

    const cache2 = new Map([["a", 1], ["b", 2]]);
    const res2 = invalidateTextureCache(cache2, "*");
    assert.equal(cache2.size, 0);
    assert.equal(res2.invalidatedCount, 2);
  });

  test("Selectively invalidates keys matching specific file or stem", () => {
    const cache = new Map([
      ["textures/dirt.svg?t=100_512", {}],
      ["comp_textures/grass_block_side.svg_textures/dirt.svg_512_100", {}],
      ["textures/dirt_path.svg?t=100_512", {}],
      ["textures/stone.png?t=100_512", {}]
    ]);

    const res = invalidateTextureCache(cache, "dirt.svg", 1234567);
    assert.equal(res.invalidatedCount, 2);
    assert.equal(res.timestamp, 1234567);
    assert.equal(res.cacheBustTimestamp, 1234567);
    assert.equal(Number(res), 1234567);

    assert.equal(cache.has("textures/dirt.svg?t=100_512"), false);
    assert.equal(cache.has("comp_textures/grass_block_side.svg_textures/dirt.svg_512_100"), false);
    assert.equal(cache.has("textures/dirt_path.svg?t=100_512"), true, "dirt_path should not be falsely matched");
    assert.equal(cache.has("textures/stone.png?t=100_512"), true);
  });

  test("Supports stem-only matching and multiple files array", () => {
    const cache = new Map([
      ["textures/cobblestone.png?t=1_512", {}],
      ["textures/oak_planks.png?t=1_512", {}],
      ["textures/bedrock.png?t=1_512", {}]
    ]);

    const res = invalidateTextureCache(cache, ["cobblestone", "oak_planks.png"]);
    assert.equal(res.invalidatedCount, 2);
    assert.equal(cache.has("textures/cobblestone.png?t=1_512"), false);
    assert.equal(cache.has("textures/oak_planks.png?t=1_512"), false);
    assert.equal(cache.has("textures/bedrock.png?t=1_512"), true);
  });

  test("Handles plain object cache safely", () => {
    const cache = {
      "textures/sand.svg?t=10_512": {},
      "textures/gravel.svg?t=10_512": {}
    };

    const res = invalidateTextureCache(cache, "sand.svg");
    assert.equal(res.invalidatedCount, 1);
    assert.equal(cache["textures/sand.svg?t=10_512"], undefined);
    assert.notEqual(cache["textures/gravel.svg?t=10_512"], undefined);
  });

  test("Handles null or undefined cache without throwing", () => {
    const res = invalidateTextureCache(null, "dirt.svg", 99999);
    assert.equal(res.invalidatedCount, 0);
    assert.equal(res.timestamp, 99999);
  });
});

describe("Application Live Sync Binding (attachLiveSync)", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  test("Binds LiveSyncClient to TextureStudioApp instance and executes cache flush & render", () => {
    let renderedCount = 0;
    const mockApp = {
      cacheBustTimestamp: 1000,
      textureCache: new Map([
        ["textures/dirt.svg?t=1000_512", {}],
        ["textures/stone.svg?t=1000_512", {}]
      ]),
      render3DObjects: () => {
        renderedCount++;
      }
    };

    let reloadFiredWith = null;
    const client = attachLiveSync(mockApp, {
      EventSource: MockEventSource,
      timestamp: 2000,
      onReload: (data) => {
        reloadFiredWith = data;
      }
    });

    const mockEs = MockEventSource.instances[0];
    mockEs.simulateOpen();

    // Trigger change event
    mockEs.simulateEvent("change", { filename: "dirt.svg", stem: "dirt" });

    assert.equal(mockApp.cacheBustTimestamp, 2000);
    assert.equal(mockApp.textureCache.size, 0);
    assert.equal(renderedCount, 1);
    assert.deepEqual(reloadFiredWith, { filename: "dirt.svg", stem: "dirt" });

    // Detach cleans up listeners and disconnects
    client.detach();
    assert.equal(client.status, "disconnected");
  });

  test("Supports partial invalidation mode on live change event", () => {
    let renderedCount = 0;
    const mockApp = {
      cacheBustTimestamp: 1000,
      textureCache: new Map([
        ["textures/dirt.svg?t=1000_512", {}],
        ["textures/stone.svg?t=1000_512", {}]
      ]),
      render3DObjects: () => {
        renderedCount++;
      }
    };

    const client = attachLiveSync(mockApp, {
      EventSource: MockEventSource,
      partialInvalidation: true,
      timestamp: 3000
    });

    const mockEs = MockEventSource.instances[0];
    mockEs.simulateOpen();

    mockEs.simulateEvent("change", { filename: "dirt.svg", stem: "dirt" });

    assert.equal(mockApp.cacheBustTimestamp, 3000);
    assert.equal(mockApp.textureCache.has("textures/dirt.svg?t=1000_512"), false);
    assert.equal(mockApp.textureCache.has("textures/stone.svg?t=1000_512"), true);
    assert.equal(renderedCount, 1);

    client.detach();
  });
});
