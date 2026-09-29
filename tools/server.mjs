import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { buildResourcePack } from "./build-pack.mjs";
import { handlePbrRequest } from "./server-pbr.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT_DIR, "cache", "packs");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const PORT = process.env.PORT || 3000;
const isDirectRun = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
const isTestEnv = process.env.NODE_ENV === "test" || process.argv.includes("--test") || process.argv.some((a) => a.includes("test"));

let texturesDir = null;
let packsFolder = null;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--textures" && process.argv[i + 1]) {
    texturesDir = path.resolve(process.argv[i + 1]);
    i++;
  } else if (process.argv[i] === "--pack" && process.argv[i + 1]) {
    const packPath = path.resolve(process.argv[i + 1]);
    texturesDir = fs.existsSync(path.join(packPath, "textures")) ? path.join(packPath, "textures") : packPath;
    i++;
  } else if (process.argv[i] === "--packs" && process.argv[i + 1]) {
    packsFolder = path.resolve(process.argv[i + 1]);
    i++;
  } else if (!process.argv[i].startsWith("--")) {
    packsFolder = path.resolve(process.argv[i]);
  }
}

// Auto-discovery fallback for textures directory (checks sibling Keyframe or local textures)
if (!texturesDir) {
  const siblingKeyframe = path.resolve(ROOT_DIR, "..", "Keyframe", "textures");
  const localTextures = path.join(ROOT_DIR, "textures");
  if (fs.existsSync(siblingKeyframe)) {
    texturesDir = siblingKeyframe;
  } else if (fs.existsSync(localTextures)) {
    texturesDir = localTextures;
  } else {
    texturesDir = localTextures;
    fs.mkdirSync(localTextures, { recursive: true });
  }
}

const appData = process.env.APPDATA || "";
if (!packsFolder) {
  const defaultMcPacks = path.join(appData, ".minecraft", "resourcepacks");
  if (fs.existsSync(defaultMcPacks)) {
    packsFolder = defaultMcPacks;
  }
}

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function discoverVanillaJar() {
  if (isTestEnv && !isDirectRun) return null;
  const versionsDir = path.join(appData, ".minecraft", "versions");
  if (!fs.existsSync(versionsDir)) return null;

  const versions = fs.readdirSync(versionsDir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  let jarPath = null;
  let jarVersion = "";

  for (const v of versions) {
    const candidate = path.join(versionsDir, v, `${v}.jar`);
    if (fs.existsSync(candidate) && !v.includes("fabric") && !v.includes("forge")) {
      jarPath = candidate;
      jarVersion = v;
      break;
    }
  }

  if (!jarPath) {
    for (const v of versions) {
      const candidate = path.join(versionsDir, v, `${v}.jar`);
      if (fs.existsSync(candidate)) {
        jarPath = candidate;
        jarVersion = v;
        break;
      }
    }
  }

  if (!jarPath) return null;

  const targetDir = path.join(CACHE_DIR, "Vanilla_Default_16x");
  if (!fs.existsSync(path.join(targetDir, "assets", "minecraft", "textures"))) {
    console.log(`[Vanilla] Extracting default vanilla textures from ${jarVersion} (${jarPath})...`);
    try {
      const psScript = `
        Add-Type -AssemblyName System.IO.Compression.FileSystem;
        $dest = '${targetDir.replace(/'/g, "''")}';
        $zip = [System.IO.Compression.ZipFile]::OpenRead('${jarPath.replace(/'/g, "''")}');
        foreach ($entry in $zip.Entries) {
          if ($entry.FullName.StartsWith('assets/minecraft/textures/')) {
            $targetPath = Join-Path $dest $entry.FullName;
            $parent = Split-Path $targetPath -Parent;
            if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null; }
            if (-not $entry.FullName.EndsWith('/')) {
              [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true);
            }
          }
        }
        $zip.Dispose();
      `;
      execSync(`powershell -Command "${psScript.replace(/\n/g, " ")}"`, { stdio: "ignore" });
    } catch (e) {
      console.error("[Vanilla] Error extracting default textures:", e.message);
    }
  }

  if (fs.existsSync(path.join(targetDir, "assets", "minecraft", "textures"))) {
    return {
      id: "pack-vanilla-default",
      name: `📦 [Vanilla] Minecraft Default (${jarVersion || "16x"})`,
      folderName: "Vanilla_Default_16x",
      description: `Official default vanilla Minecraft ${jarVersion} textures (16x16)`,
      type: "vanilla_default",
      basePath: "cache/packs/Vanilla_Default_16x/assets/minecraft/textures"
    };
  }

  return null;
}

function discoverPacks(folderPath) {
  if (isTestEnv && !isDirectRun) return [];
  const discovered = [];

  const vanilla = discoverVanillaJar();
  if (vanilla) {
    discovered.push(vanilla);
  }

  if (!folderPath || !fs.existsSync(folderPath)) {
    return discovered;
  }

  const items = fs.readdirSync(folderPath);

  for (const item of items) {
    const fullPath = path.join(folderPath, item);
    const stat = fs.statSync(fullPath);
    const ext = path.extname(item).toLowerCase();
    const stem = path.basename(item, ext);

    if (stat.isFile() && ext === ".zip") {
      const targetDir = path.join(CACHE_DIR, stem);
      if (!fs.existsSync(targetDir)) {
        console.log(`[Packs] Extracting zip pack "${item}" to cache...`);
        try {
          const cmd = `powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${fullPath.replace(/'/g, "''")}', '${targetDir.replace(/'/g, "''")}')"`;
          execSync(cmd, { stdio: "ignore" });
        } catch (e) {
          console.error(`[Packs] Error extracting ${item}:`, e.message);
        }
      }

      if (fs.existsSync(path.join(targetDir, "assets", "minecraft"))) {
        let packDesc = item;
        const mcmeta = path.join(targetDir, "pack.mcmeta");
        if (fs.existsSync(mcmeta)) {
          try {
            const data = JSON.parse(fs.readFileSync(mcmeta, "utf-8"));
            if (data.pack && data.pack.description) packDesc = data.pack.description;
          } catch (e) {}
        }

        discovered.push({
          id: `pack-${stem}`,
          name: `📦 [Pack] ${stem.replace(/_/g, " ")}`,
          folderName: stem,
          description: packDesc,
          type: "external_pack",
          basePath: `cache/packs/${stem}/assets/minecraft/textures`
        });
      }
    } else if (stat.isDirectory()) {
      if (fs.existsSync(path.join(fullPath, "assets", "minecraft"))) {
        discovered.push({
          id: `pack-${item}`,
          name: `📦 [Pack] ${item}`,
          folderName: item,
          type: "external_pack",
          basePath: fullPath
        });
      }
    }
  }

  return discovered;
}

function discoverActivePack(dir) {
  let packTitle = "Active Pack";
  const parentDir = path.dirname(dir);
  const pkgJsonPath = path.join(parentDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.name) {
        packTitle = pkg.name.replace(/^@[^/]+\//, "");
        packTitle = packTitle.charAt(0).toUpperCase() + packTitle.slice(1);
      }
    } catch {}
  } else {
    packTitle = path.basename(parentDir) || "Active Pack";
  }

  if (!fs.existsSync(dir)) {
    return {
      id: "pack-active",
      name: `✨ [Pack] ${packTitle}`,
      folderName: packTitle,
      description: "No textures found in working directory",
      isVector: true,
      blocks: []
    };
  }

  // Scan both dir and dir/block (if present)
  const fileEntries = [];
  const addFilesFrom = (targetDir, urlPrefix) => {
    if (!fs.existsSync(targetDir)) return;
    const entries = fs.readdirSync(targetDir);
    for (const f of entries) {
      if (/\.(svg|png)$/i.test(f)) {
        fileEntries.push({ file: f, url: `${urlPrefix}${f}`, stem: f.replace(/\.(svg|png)$/i, "") });
      }
    }
  };

  addFilesFrom(dir, "textures/");
  const blockSub = path.join(dir, "block");
  if (fs.existsSync(blockSub) && fs.statSync(blockSub).isDirectory()) {
    addFilesFrom(blockSub, "textures/block/");
  }

  const fileSet = new Set(fileEntries.map((e) => e.file));
  const blocks = new Map();

  function formatTitle(id) {
    return id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  // 1. Multi-part textures
  for (const entry of fileEntries) {
    const stem = entry.stem;
    if (stem.endsWith("_side_overlay")) {
      const base = stem.replace(/_side_overlay$/, "");
      if (!blocks.has(base)) blocks.set(base, { id: base, textures: {} });
      blocks.get(base).textures.side_overlay = entry.url;
    } else if (stem.endsWith("_top")) {
      const base = stem.replace(/_top$/, "");
      if (!blocks.has(base)) blocks.set(base, { id: base, textures: {} });
      blocks.get(base).textures.top = entry.url;
      if (!blocks.get(base).textures.bottom) blocks.get(base).textures.bottom = entry.url;
    } else if (stem.endsWith("_bottom")) {
      const base = stem.replace(/_bottom$/, "");
      if (!blocks.has(base)) blocks.set(base, { id: base, textures: {} });
      blocks.get(base).textures.bottom = entry.url;
    } else if (stem.endsWith("_side")) {
      const base = stem.replace(/_side$/, "");
      if (!blocks.has(base)) blocks.set(base, { id: base, textures: {} });
      blocks.get(base).textures.side = entry.url;
    }
  }

  // 2. Base & standalone textures
  for (const entry of fileEntries) {
    const stem = entry.stem;
    if (stem.endsWith("_side_overlay") || stem.endsWith("_top") || stem.endsWith("_bottom") || stem.endsWith("_side")) {
      continue;
    }
    if (blocks.has(stem)) {
      blocks.get(stem).textures.side = entry.url;
    } else {
      blocks.set(stem, {
        id: stem,
        textures: { all: entry.url }
      });
    }
  }

  // Special fallbacks (e.g. grass_block / dirt_path dirt bottom)
  const dirtEntry = fileEntries.find((e) => e.stem === "dirt");
  const dirtUrl = dirtEntry ? dirtEntry.url : "textures/dirt.svg";
  if (blocks.has("grass_block") && dirtEntry) {
    blocks.get("grass_block").textures.bottom = dirtUrl;
  }
  if (blocks.has("dirt_path") && dirtEntry) {
    blocks.get("dirt_path").textures.bottom = dirtUrl;
  }

  const discoveredBlocks = Array.from(blocks.values()).map((b) => ({
    id: b.id,
    name: formatTitle(b.id),
    type: b.id.includes("log") ? "Wood Log" : (b.id.includes("plank") ? "Wood Planks" : (b.id.includes("deepslate") ? "Metamorphic Rock" : "Terrain Block")),
    textures: b.textures,
    tiling: "Toroidal Seamless"
  }));

  return {
    id: "pack-active",
    name: `✨ [Pack] ${packTitle}`,
    folderName: packTitle,
    description: "Dynamically discovered textures from working directory",
    isVector: true,
    blocks: discoveredBlocks
  };
}

const externalPacks = discoverPacks(packsFolder);

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".zip": "application/zip",
  ".ico": "image/x-icon"
};

/**
 * Creates an SSE hub managing client streams and event broadcasting.
 *
 * @param {object} [options={}]
 * @param {number} [options.keepAliveIntervalMs=15000] - Interval between keep-alive comments
 * @returns {object} Hub instance
 */
function createSseHub(options = {}) {
  const clients = new Set();
  const keepAliveIntervalMs = options.keepAliveIntervalMs ?? 15000;
  let keepAliveTimer = null;

  function broadcast(event, data) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    const message = event ? `event: ${event}\ndata: ${payload}\n\n` : `data: ${payload}\n\n`;
    for (const client of Array.from(clients)) {
      try {
        client.write(message);
      } catch {
        clients.delete(client);
      }
    }
    return message;
  }

  function sendKeepAlive() {
    for (const client of Array.from(clients)) {
      try {
        client.write(": keep-alive\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }

  function addClient(res, req = null) {
    clients.add(res);

    const onDisconnect = () => {
      removeClient(res);
      res.removeListener("close", onDisconnect);
      res.removeListener("finish", onDisconnect);
      res.removeListener("error", onDisconnect);
      if (req) {
        req.removeListener("close", onDisconnect);
        req.removeListener("aborted", onDisconnect);
        req.removeListener("error", onDisconnect);
      }
    };

    res.once("close", onDisconnect);
    res.once("finish", onDisconnect);
    res.once("error", onDisconnect);
    if (req) {
      req.once("close", onDisconnect);
      req.once("aborted", onDisconnect);
      req.once("error", onDisconnect);
      if (req.socket) req.socket.once("close", onDisconnect);
    }
    if (res.socket) res.socket.once("close", onDisconnect);

    return () => onDisconnect();
  }

  function removeClient(res) {
    clients.delete(res);
  }

  function getClientCount() {
    return clients.size;
  }

  function startKeepAlive() {
    if (keepAliveTimer || keepAliveIntervalMs <= 0) return;
    keepAliveTimer = setInterval(sendKeepAlive, keepAliveIntervalMs);
    if (keepAliveTimer && typeof keepAliveTimer.unref === "function") {
      keepAliveTimer.unref();
    }
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function close() {
    stopKeepAlive();
    for (const client of Array.from(clients)) {
      try {
        client.end();
      } catch {}
    }
    clients.clear();
  }

  startKeepAlive();

  return {
    clients,
    broadcast,
    sendKeepAlive,
    addClient,
    removeClient,
    getClientCount,
    startKeepAlive,
    stopKeepAlive,
    close
  };
}

/**
 * Handles incoming SSE /api/events requests.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {object} [hub=sseHub]
 * @returns {boolean}
 */
function handleEventsRequest(req, res, hub = sseHub) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cache-Control"
    });
    res.end();
    return true;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain",
      "Allow": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Origin": "*"
    });
    res.end("405 Method Not Allowed");
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  // Initial comment to verify live SSE connection
  res.write(": keep-alive\n\n");

  if (hub) {
    hub.addClient(res, req);
  }

  return true;
}

/**
 * Broadcasts a texture reload event to all connected SSE clients.
 *
 * @param {object} hub - SSE hub instance
 * @param {object} [data={}] - Change event payload
 * @param {string} [eventName='change'] - SSE event name
 * @returns {object|null} The sent payload
 */
function broadcastReload(hub, data = {}, eventName = "change") {
  if (!hub) return null;
  const payload = {
    type: data.type || eventName,
    timestamp: Date.now(),
    ...data
  };
  hub.broadcast(eventName, payload);
  return payload;
}

/**
 * Watches texture directories for changes with a 100ms debounce to prevent reload storms.
 *
 * @param {string|string[]} dirOrDirs - Directory path or list of directory paths
 * @param {Function} onBroadcast - Callback invoked when debounced change triggers
 * @param {number} [debounceMs=100] - Debounce interval in milliseconds
 * @returns {object} Watcher handle with close() and triggerNow() methods
 */
function watchTextureDir(dirOrDirs, onBroadcast, debounceMs = 100) {
  const dirs = Array.isArray(dirOrDirs) ? dirOrDirs : [dirOrDirs];
  const watchers = [];
  const pendingChanges = new Set();
  let debounceTimer = null;

  function triggerBroadcast() {
    if (pendingChanges.size === 0) return;
    const files = Array.from(pendingChanges);
    pendingChanges.clear();

    const primaryFile = files[0];
    const ext = primaryFile ? path.extname(primaryFile) : "";
    const stem = primaryFile ? path.basename(primaryFile, ext) : "";

    const payload = {
      type: "change",
      files,
      filename: primaryFile,
      stem,
      timestamp: Date.now()
    };

    if (typeof onBroadcast === "function") {
      onBroadcast(payload);
    }
  }

  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;

    const listener = (eventType, filename) => {
      if (filename) {
        const base = path.basename(filename);
        if (base.startsWith(".") || base.endsWith("~") || base.endsWith(".tmp")) {
          return;
        }
        pendingChanges.add(base);
      } else {
        pendingChanges.add("textures");
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        triggerBroadcast();
      }, debounceMs);
      if (debounceTimer && typeof debounceTimer.unref === "function") {
        debounceTimer.unref();
      }
    };

    try {
      const watcher = fs.watch(dir, { recursive: false }, listener);
      watcher.on("error", () => {});
      watchers.push(watcher);
    } catch {}
  }

  return {
    watchers,
    pendingChanges,
    close() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const w of watchers) {
        try {
          w.close();
        } catch {}
      }
      watchers.length = 0;
    },
    triggerNow() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      triggerBroadcast();
    }
  };
}

const watchTextureDirs = watchTextureDir;

const sseHub = createSseHub();
let textureWatcher = null;

const defaultWatchDirs = [texturesDir];
const localTexturesDir = path.join(ROOT_DIR, "textures");
if (fs.existsSync(localTexturesDir) && path.resolve(localTexturesDir) !== path.resolve(texturesDir)) {
  defaultWatchDirs.push(localTexturesDir);
}

if (isDirectRun || (!isTestEnv && process.env.NODE_ENV !== "test")) {
  textureWatcher = watchTextureDir(defaultWatchDirs, (payload) => {
    broadcastReload(sseHub, payload);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let reqPath = decodeURIComponent(urlObj.pathname);

  // API Route: /api/events (Live SSE File-Watcher & Auto-Reload)
  if (reqPath === "/api/events") {
    handleEventsRequest(req, res, sseHub);
    return;
  }

  // API Route: /api/pbr/:blockId/:mapType (Dynamic LabPBR 1.3 Normal & Specular Generator)
  if (reqPath.startsWith("/api/pbr/")) {
    const handled = await handlePbrRequest(req, res, { texturesDir });
    if (handled) return;
  }

  // API Route: /api/pack (Active Working Pack Auto-Discovery)
  if (reqPath === "/api/pack") {
    const activePack = discoverActivePack(texturesDir);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(activePack));
    return;
  }

  // API Route: /api/packs (External Comparison Packs)
  if (reqPath === "/api/packs") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(externalPacks));
    return;
  }

  // API Route: /api/export (Triggers build and returns info or streams zip)
  if (reqPath === "/api/export") {
    const resParam = parseInt(urlObj.searchParams.get("res") || "512", 10);
    const result = await buildResourcePack(resParam, texturesDir);

    if (urlObj.searchParams.get("download") === "1") {
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": fs.statSync(result.filePath).size
      });
      const stream = fs.createReadStream(result.filePath);
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({
      success: true,
      ...result,
      downloadUrl: `/api/export?res=${resParam}&download=1`
    }));
    return;
  }

  // Dynamic Textures Directory Serving (/textures/*)
  if (reqPath.startsWith("/textures/")) {
    const relFile = reqPath.replace(/^\/textures\//, "");
    let targetFile = path.join(texturesDir, relFile);
    if (!fs.existsSync(targetFile) && fs.existsSync(path.join(texturesDir, "block", relFile))) {
      targetFile = path.join(texturesDir, "block", relFile);
    }
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile).toLowerCase();
      res.writeHead(200, {
        "Content-Type": ext === ".png" ? "image/png" : "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      });
      fs.createReadStream(targetFile).pipe(res);
      return;
    }
  }

  if (reqPath === "/") reqPath = "/index.html";

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${PORT} in use. Retrying in 1 sec...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 1000);
  }
});

if (isDirectRun || (!isTestEnv && process.env.NODE_ENV !== "test")) {
  server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Ninja6 Texture Studio — Multi-Set 3D Engine & Compiler`);
  console.log(`  Working Pack Dir: ${texturesDir}`);
  console.log(`  Comparison Packs: ${packsFolder || "(None)"}`);
  console.log(`  Running live at:  http://localhost:${PORT}`);
  console.log(`======================================================\n`);
  });
}

server.on("close", () => {
  textureWatcher?.close();
  sseHub?.close();
});

export {
  server,
  createSseHub,
  watchTextureDir,
  watchTextureDirs,
  broadcastReload,
  handleEventsRequest,
  discoverActivePack,
  sseHub,
  texturesDir
};
