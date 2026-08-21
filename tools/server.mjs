import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { buildResourcePack } from "./build-pack.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT_DIR, "cache", "packs");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const PORT = process.env.PORT || 3000;

let packsFolder = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--packs" && process.argv[i + 1]) {
    packsFolder = process.argv[i + 1];
    i++;
  } else if (!process.argv[i].startsWith("--")) {
    packsFolder = process.argv[i];
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

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let reqPath = decodeURIComponent(urlObj.pathname);

  // API Route: /api/packs
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
    const result = buildResourcePack(resParam);

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

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Ninja6 Texture Studio — Multi-Set 3D Engine & Compiler`);
  console.log(`  Packs Directory: ${packsFolder || "(None)"}`);
  console.log(`  Running live at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
