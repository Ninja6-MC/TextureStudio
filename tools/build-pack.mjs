import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TEXTURES_DIR = path.join(ROOT_DIR, "textures");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const ZIP_SCRIPT = path.join(__dirname, "zip.ps1");

/**
 * Main Resource Pack Compiler
 */
export function buildResourcePack(targetRes = 512) {
  console.log(`\n======================================================`);
  console.log(`  Ninja6 Vector Resource Pack Compiler`);
  console.log(`  Target Resolution: ${targetRes}×${targetRes}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const BUILD_TMP = path.join(ROOT_DIR, "cache", `build_tmp_${targetRes}`);
  if (fs.existsSync(BUILD_TMP)) {
    fs.rmSync(BUILD_TMP, { recursive: true, force: true });
  }

  const BLOCKS_DIR = path.join(BUILD_TMP, "assets", "minecraft", "textures", "block");
  const ITEMS_DIR = path.join(BUILD_TMP, "assets", "minecraft", "textures", "item");
  fs.mkdirSync(BLOCKS_DIR, { recursive: true });
  fs.mkdirSync(ITEMS_DIR, { recursive: true });

  // 1. Generate pack.mcmeta (Universal 1.20 - 1.21.4+ support)
  const mcmeta = {
    pack: {
      pack_format: 46,
      supported_formats: {
        min_inclusive: 15,
        max_inclusive: 46
      },
      description: `§6Ninja6 Vector HD §8- §a${targetRes}x§r\n§7Vector-Mastered Native Textures`
    }
  };

  fs.writeFileSync(path.join(BUILD_TMP, "pack.mcmeta"), JSON.stringify(mcmeta, null, 2), "utf-8");
  console.log(`[1/4] Created pack.mcmeta (Supported Formats: 1.20 - 1.21.4+)`);

  if (!fs.existsSync(TEXTURES_DIR)) {
    fs.mkdirSync(TEXTURES_DIR, { recursive: true });
  }

  // 2. High-Speed Rust Resvg Rasterization
  const svgFiles = fs.readdirSync(TEXTURES_DIR).filter((f) => f.endsWith(".svg"));
  const ITEM_IDS = new Set(["cooked_beef", "golden_apple", "compass_nexus", "plot_compass", "spiral_core", "ninja6_token"]);

  function rasterize(srcSvgPath, destPngPath, size) {
    const svgText = fs.readFileSync(srcSvgPath, "utf-8");
    const resvg = new Resvg(svgText, {
      fitTo: {
        mode: "width",
        value: size
      }
    });
    const pngData = resvg.render();
    fs.writeFileSync(destPngPath, pngData.asPng());
  }

  console.log(`[2/4] Rasterizing ${svgFiles.length} vector textures to ${targetRes}×${targetRes} PNG...`);

  for (const svgFile of svgFiles) {
    const stem = path.basename(svgFile, ".svg");
    const isItem = ITEM_IDS.has(stem);
    const targetDir = isItem ? ITEMS_DIR : BLOCKS_DIR;
    const destPng = path.join(targetDir, `${stem}.png`);
    const srcSvg = path.join(TEXTURES_DIR, svgFile);

    rasterize(srcSvg, destPng, targetRes);
    console.log(`  ✓ ${isItem ? "item" : "block"}/${stem}.png`);
  }

  // 3. Generate un-rotated Blockstates (locks texture direction uniformly, like Bare Bones)
  const BLOCKSTATES_DIR = path.join(BUILD_TMP, "assets", "minecraft", "blockstates");
  fs.mkdirSync(BLOCKSTATES_DIR, { recursive: true });

  fs.writeFileSync(path.join(BLOCKSTATES_DIR, "dirt.json"), JSON.stringify({
    variants: {
      "": [{ model: "minecraft:block/dirt" }]
    }
  }, null, 2));

  fs.writeFileSync(path.join(BLOCKSTATES_DIR, "grass_block.json"), JSON.stringify({
    variants: {
      "snowy=false": [{ model: "minecraft:block/grass_block" }],
      "snowy=true": { model: "minecraft:block/grass_block_snow" }
    }
  }, null, 2));

  fs.writeFileSync(path.join(BLOCKSTATES_DIR, "dirt_path.json"), JSON.stringify({
    variants: {
      "": [{ model: "minecraft:block/dirt_path" }]
    }
  }, null, 2));
  console.log(`[3/5] Bundled un-rotated blockstates (dirt, grass_block, dirt_path)`);

  // 4. Generate pack.png (128x128 pack icon)
  const packIconDest = path.join(BUILD_TMP, "pack.png");
  const grassTopSvg = path.join(TEXTURES_DIR, "grass_block_top.svg");
  if (fs.existsSync(grassTopSvg)) {
    rasterize(grassTopSvg, packIconDest, 128);
  }
  console.log(`[4/5] Generated pack.png (128×128 icon)`);

  // 4. Package into clean Minecraft-compliant .ZIP with strict POSIX '/' separators
  const zipFileName = `Ninja6-Vector-HD-${targetRes}x.zip`;
  const zipOutputPath = path.join(DIST_DIR, zipFileName);

  if (fs.existsSync(zipOutputPath)) {
    fs.unlinkSync(zipOutputPath);
  }

  console.log(`[4/4] Creating ZIP archive with strict POSIX path separators: ${zipFileName}...`);

  execSync(`powershell -ExecutionPolicy Bypass -File "${ZIP_SCRIPT}" -SourceDir "${BUILD_TMP}" -ZipFile "${zipOutputPath}"`, { stdio: "ignore" });

  // 5. Auto-sync unzipped folder to local .minecraft/resourcepacks if present
  const mcResourcePacks = path.join(process.env.APPDATA || "", ".minecraft", "resourcepacks");
  if (fs.existsSync(mcResourcePacks)) {
    const destFolder = path.join(mcResourcePacks, "Ninja6-Vector-HD-512x");
    fs.cpSync(BUILD_TMP, destFolder, { recursive: true });
    // Also copy zip
    fs.copyFileSync(zipOutputPath, path.join(mcResourcePacks, zipFileName));
    console.log(`[5/5] Auto-deployed to Minecraft: ${destFolder}`);
  }

  const fileBuffer = fs.readFileSync(zipOutputPath);
  const sha1Hash = crypto.createHash("sha1").update(fileBuffer).digest("hex");
  const stats = fs.statSync(zipOutputPath);

  fs.rmSync(BUILD_TMP, { recursive: true, force: true });

  console.log(`\n======================================================`);
  console.log(`  ✓ BUILD SUCCESSFUL!`);
  console.log(`  File:    ${zipOutputPath}`);
  console.log(`  Size:    ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`  SHA-1:   ${sha1Hash}`);
  console.log(`======================================================\n`);

  return {
    filePath: zipOutputPath,
    fileName: zipFileName,
    sizeKb: (stats.size / 1024).toFixed(1),
    sha1: sha1Hash
  };
}

// CLI Execution Support
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--all")) {
    const resolutions = [512, 256, 128, 64, 32];
    for (const res of resolutions) {
      buildResourcePack(res);
    }
  } else {
    let targetRes = 512;
    for (let i = 2; i < process.argv.length; i++) {
      if (process.argv[i] === "--res" && process.argv[i + 1]) {
        targetRes = parseInt(process.argv[i + 1], 10) || 512;
        i++;
      } else if (!isNaN(parseInt(process.argv[i], 10))) {
        targetRes = parseInt(process.argv[i], 10);
      }
    }
    buildResourcePack(targetRes);
  }
}
