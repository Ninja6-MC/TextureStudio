import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// --------------------------------------------------------------------------
// Standard IEEE 802.3 CRC32 Implementation
// --------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf, start = 0, end = buf.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --------------------------------------------------------------------------
// Pure Node.js PNG Encoding Engine (Zero External Dependencies)
// --------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcPayload = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcPayload), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function encodePng(width, height, rgbaBuffer) {
  if (rgbaBuffer.length < width * height * 4) {
    throw new Error(
      `Invalid buffer length ${rgbaBuffer.length}: expected at least ${width * height * 4} bytes for ${width}x${height} RGBA`
    );
  }

  const rowStride = width * 4;
  const scanlineStride = 1 + rowStride;
  const scanlines = Buffer.alloc(height * scanlineStride);

  for (let y = 0; y < height; y++) {
    scanlines[y * scanlineStride] = 0; // Filter 0 (None)
    rgbaBuffer.copy(scanlines, y * scanlineStride + 1, y * rowStride, (y + 1) * rowStride);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // 8 bits per channel
  ihdrData[9] = 6;  // Color type 6 (RGBA)
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Standard adaptive
  ihdrData[12] = 0; // Non-interlaced

  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

// --------------------------------------------------------------------------
// Pattern Matching Helpers
// --------------------------------------------------------------------------

const GLOB_METACHARS = /[.+^${}()|[\]\\]/g;
const globRegexCache = new Map();

export function globToRegExp(pattern) {
  const cached = globRegexCache.get(pattern);
  if (cached) return cached;
  const body = pattern
    .replace(GLOB_METACHARS, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${body}$`);
  globRegexCache.set(pattern, regex);
  return regex;
}

export function matchGlob(name, pattern) {
  return globToRegExp(pattern).test(name);
}

// --------------------------------------------------------------------------
// Default LabPBR 1.3 Material Rules & Fallbacks
// --------------------------------------------------------------------------

export const DEFAULT_FALLBACK_RULES = {
  version: "1.0.0",
  defaultMaterial: {
    baseHeight: 215,
    smoothness: 35,
    f0: 10,
    porosity: 5,
    emission: 0,
    ao: 255,
    normalStrength: 1.0
  },
  materials: {
    stone: {
      baseHeight: 215,
      smoothness: 35,
      f0: 10,
      porosity: 5,
      emission: 0,
      ao: 255,
      colorFeatures: [
        { hex: "#7e8187", height: 215, smoothness: 35, f0: 10, porosity: 5, ao: 255 },
        { hex: "#5f6268", height: 160, smoothness: 30, f0: 10, porosity: 10, ao: 200 },
        { hex: "#3c3e44", height: 140, smoothness: 25, f0: 10, porosity: 10, ao: 160 },
        { hex: "#a4a7ae", height: 225, smoothness: 45, f0: 10, porosity: 5, ao: 255 }
      ]
    },
    diamond_ore: {
      baseHeight: 215,
      smoothness: 35,
      f0: 10,
      porosity: 5,
      emission: 0,
      colorFeatures: [
        { hex: "#137f76", height: 235, smoothness: 200, f0: 44, porosity: 0, emission: 20 },
        { hex: "#4eebd9", height: 250, smoothness: 225, f0: 48, porosity: 0, emission: 30 },
        { hex: "#73f7eb", height: 250, smoothness: 225, f0: 48, porosity: 0, emission: 30 },
        { hex: "#a7fbf3", height: 255, smoothness: 235, f0: 50, porosity: 0, emission: 35 },
        { hex: "#084a44", height: 225, smoothness: 190, f0: 40, porosity: 0, emission: 10 },
        { hex: "#202a33", height: 160, smoothness: 35, f0: 10, porosity: 5, emission: 0, ao: 160 },
        { hex: "#7e8187", height: 215, smoothness: 35, f0: 10, porosity: 5, ao: 255 },
        { hex: "#5f6268", height: 160, smoothness: 30, f0: 10, porosity: 10, ao: 200 },
        { hex: "#3c3e44", height: 140, smoothness: 25, f0: 10, porosity: 10, ao: 160 },
        { hex: "#a4a7ae", height: 225, smoothness: 45, f0: 10, porosity: 5, ao: 255 }
      ]
    },
    coal_ore: {
      baseHeight: 215,
      smoothness: 35,
      f0: 10,
      porosity: 5,
      emission: 0,
      colorFeatures: [
        { hex: "#1e2229", height: 228, smoothness: 65, f0: 14, porosity: 8, emission: 0 },
        { hex: "#2e343e", height: 235, smoothness: 75, f0: 16, porosity: 8, emission: 0 },
        { hex: "#7e8187", height: 215, smoothness: 35, f0: 10, porosity: 5, ao: 255 },
        { hex: "#5f6268", height: 160, smoothness: 30, f0: 10, porosity: 10, ao: 200 },
        { hex: "#3c3e44", height: 140, smoothness: 25, f0: 10, porosity: 10, ao: 160 },
        { hex: "#a4a7ae", height: 225, smoothness: 45, f0: 10, porosity: 5, ao: 255 }
      ]
    },
    oak_planks: {
      baseHeight: 220,
      smoothness: 85,
      f0: 10,
      porosity: 12,
      emission: 0,
      colorFeatures: [
        { hex: "#b8945f", height: 220, smoothness: 85, f0: 10, porosity: 12 },
        { hex: "#967441", height: 215, smoothness: 75, f0: 10, porosity: 15 },
        { hex: "#67502c", height: 150, smoothness: 50, f0: 10, porosity: 20, ao: 170 }
      ]
    },
    dirt: {
      baseHeight: 210,
      smoothness: 20,
      f0: 10,
      porosity: 55,
      emission: 0,
      colorFeatures: [
        { hex: "#c77d38", height: 210, smoothness: 20, f0: 10, porosity: 55 },
        { hex: "#a35f24", height: 225, smoothness: 18, f0: 10, porosity: 50 },
        { hex: "#864a18", height: 235, smoothness: 18, f0: 10, porosity: 50 },
        { hex: "#6f7887", height: 235, smoothness: 40, f0: 10, porosity: 5 }
      ]
    },
    coarse_dirt: {
      baseHeight: 205,
      smoothness: 18,
      f0: 10,
      porosity: 58,
      emission: 0
    },
    sand: {
      baseHeight: 215,
      smoothness: 15,
      f0: 10,
      porosity: 64,
      emission: 0
    },
    gravel: {
      baseHeight: 215,
      smoothness: 25,
      f0: 10,
      porosity: 40,
      emission: 0
    },
    deepslate: {
      baseHeight: 210,
      smoothness: 45,
      f0: 10,
      porosity: 4,
      emission: 0
    },
    clay: {
      baseHeight: 220,
      smoothness: 55,
      f0: 12,
      porosity: 20,
      emission: 0
    },
    bedrock: {
      baseHeight: 200,
      smoothness: 30,
      f0: 10,
      porosity: 0,
      emission: 0
    }
  },
  patterns: [
    { pattern: "*_ore", material: "stone" },
    { pattern: "*_planks", material: "oak_planks" },
    { pattern: "*_log*", material: "oak_planks" },
    { pattern: "*dirt*", material: "dirt" },
    { pattern: "*sand*", material: "sand" },
    { pattern: "*gravel*", material: "gravel" },
    { pattern: "*deepslate*", material: "deepslate" }
  ]
};

export function hexToRgb(hex) {
  const clean = hex.replace(/^#/, "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

let cachedRules = null;
let cachedRulesPath = null;

export function loadPbrRules(rulesPath = null) {
  if (rulesPath && cachedRules && cachedRulesPath === rulesPath) {
    return cachedRules;
  }

  const candidatePaths = [];
  if (rulesPath) candidatePaths.push(rulesPath);
  candidatePaths.push(path.resolve(ROOT_DIR, "..", "Keyframe", "tools", "lib", "pbr-rules.json"));
  candidatePaths.push("D:/Projects/Ninja6-MC/Keyframe/tools/lib/pbr-rules.json");
  candidatePaths.push(path.resolve(ROOT_DIR, "tools", "pbr-rules.json"));

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
        cachedRules = parsed;
        cachedRulesPath = p;
        return parsed;
      } catch {
        // Fall through to next candidate
      }
    }
  }

  return DEFAULT_FALLBACK_RULES;
}

export function resolveMaterial(stem, rules = null) {
  const activeRules = rules || loadPbrRules();
  const defaultMat = activeRules.defaultMaterial || DEFAULT_FALLBACK_RULES.defaultMaterial;
  const baseStem = path.basename(String(stem).replace(/\\/g, "/")).replace(/\.(svg|png)$/i, "");

  let rawMat = null;

  if (activeRules.materials && activeRules.materials[baseStem]) {
    rawMat = activeRules.materials[baseStem];
  } else if (activeRules.patterns && Array.isArray(activeRules.patterns)) {
    for (const entry of activeRules.patterns) {
      if (entry.pattern && matchGlob(baseStem, entry.pattern)) {
        const targetMat = activeRules.materials?.[entry.material];
        if (targetMat) {
          rawMat = targetMat;
          break;
        }
      }
    }
  }

  if (!rawMat) {
    rawMat = defaultMat;
  }

  const resolved = { ...defaultMat, ...rawMat };

  if (resolved.colorFeatures && Array.isArray(resolved.colorFeatures)) {
    resolved.parsedFeatures = resolved.colorFeatures.map((f) => ({
      ...f,
      rgb: hexToRgb(f.hex)
    }));
  } else {
    resolved.parsedFeatures = [];
  }

  return resolved;
}

export function evaluatePixel(r, g, b, a, material, options = {}) {
  if (a === 0) {
    return {
      height: 1,
      ao: 255,
      smoothness: 0,
      f0: 0,
      porosity: 0,
      emission: 0
    };
  }

  const features = material.parsedFeatures || [];
  let bestFeat = null;
  let bestDist = Infinity;

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const dist = Math.hypot(r - f.rgb.r, g - f.rgb.g, b - f.rgb.b);
    if (dist < bestDist) {
      bestDist = dist;
      bestFeat = f;
    }
  }

  const tolerance = typeof options.colorTolerance === "number" ? options.colorTolerance : 64;

  if (bestFeat && bestDist <= tolerance) {
    return {
      height: bestFeat.height ?? material.baseHeight ?? 215,
      ao: bestFeat.ao ?? material.ao ?? 255,
      smoothness: bestFeat.smoothness ?? material.smoothness ?? 35,
      f0: bestFeat.f0 ?? material.f0 ?? 10,
      porosity: bestFeat.porosity ?? material.porosity ?? 5,
      emission: bestFeat.emission ?? material.emission ?? 0
    };
  }

  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let height;

  if (options.useLuminance) {
    height = Math.max(1, Math.min(255, Math.round(lum)));
  } else if (features.length === 0) {
    height = Math.max(1, Math.min(255, Math.round((material.baseHeight ?? 215) + (lum - 128) * 0.25)));
  } else {
    height = material.baseHeight ?? 215;
  }

  return {
    height,
    ao: material.ao ?? 255,
    smoothness: material.smoothness ?? 35,
    f0: material.f0 ?? 10,
    porosity: material.porosity ?? 5,
    emission: material.emission ?? 0
  };
}

// --------------------------------------------------------------------------
// LabPBR 1.3 Normal Map Generator (_n)
// --------------------------------------------------------------------------

/**
 * Generates LabPBR 1.3 Normal Map (_n) with DirectX Y- encoding.
 * - Red (R): Normal X (0 = left, 128 = flat, 255 = right)
 * - Green (G): Normal Y in DirectX top-down format (0 = up, 128 = flat, 255 = down)
 * - Blue (B): Linear Material AO (0 = occluded, 255 = open)
 * - Alpha (A): POM Height / displacement depth (1..255)
 */
export function generateNormalMap(stem, pixels, width, height, options = {}) {
  const rules = options.rules || loadPbrRules(options.rulesPath);
  const material = resolveMaterial(stem, rules);

  const heightGrid = new Float32Array(width * height);
  const aoGrid = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      const props = evaluatePixel(r, g, b, a, material, options);
      heightGrid[y * width + x] = props.height;
      aoGrid[y * width + x] = props.ao;
    }
  }

  function sampleHeight(x, y) {
    const sx = (x % width + width) % width;
    const sy = (y % height + height) % height;
    return heightGrid[sy * width + sx];
  }

  const normalStrength = options.normalStrength ?? material.normalStrength ?? 1.0;
  const normalPixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const h_tl = sampleHeight(x - 1, y - 1);
      const h_t  = sampleHeight(x,     y - 1);
      const h_tr = sampleHeight(x + 1, y - 1);
      const h_l  = sampleHeight(x - 1, y);
      const h_r  = sampleHeight(x + 1, y);
      const h_bl = sampleHeight(x - 1, y + 1);
      const h_b  = sampleHeight(x,     y + 1);
      const h_br = sampleHeight(x + 1, y + 1);

      // Standard 3x3 Sobel filter
      const dx = ((h_tr + 2 * h_r + h_br) - (h_tl + 2 * h_l + h_bl)) / (8 * 255);
      const dy = ((h_bl + 2 * h_b + h_br) - (h_tl + 2 * h_t + h_tr)) / (8 * 255);

      const vx = -dx * normalStrength;
      const vy = -dy * normalStrength;
      const vz = 1.0;
      const len = Math.hypot(vx, vy, vz);

      const Nx = vx / len;
      const Ny = vy / len;

      const rOut = Math.max(0, Math.min(255, Math.round((Nx * 0.5 + 0.5) * 255)));
      const gOut = Math.max(0, Math.min(255, Math.round((Ny * 0.5 + 0.5) * 255)));
      const bOut = Math.max(0, Math.min(255, aoGrid[y * width + x]));
      const aOut = Math.max(1, Math.min(255, Math.round(heightGrid[y * width + x])));

      normalPixels[idx] = rOut;
      normalPixels[idx + 1] = gOut;
      normalPixels[idx + 2] = bOut;
      normalPixels[idx + 3] = aOut;
    }
  }

  let cachedNormalPng = null;
  Object.defineProperty(normalPixels, "png", {
    get() {
      if (!cachedNormalPng) cachedNormalPng = encodePng(width, height, normalPixels);
      return cachedNormalPng;
    },
    set(val) {
      cachedNormalPng = val;
    },
    configurable: true
  });

  if (options.encode === true) {
    const pngBuf = encodePng(width, height, normalPixels);
    pngBuf.pixels = normalPixels;
    return pngBuf;
  }

  return normalPixels;
}

// --------------------------------------------------------------------------
// LabPBR 1.3 Specular Map Generator (_s)
// --------------------------------------------------------------------------

/**
 * Generates LabPBR 1.3 Specular Map (_s).
 * - Red (R): Perceptual Smoothness (0 = rough matte, 255 = mirror)
 * - Green (G): Reflectance / Linear F0 (0..229 = dielectric, 230..255 = metals)
 * - Blue (B): Porosity (0..64) / SSS (65..255)
 * - Alpha (A): Linear Emission (0..254, 255 reserved)
 */
export function generateSpecularMap(stem, pixels, width, height, options = {}) {
  const rules = options.rules || loadPbrRules(options.rulesPath);
  const material = resolveMaterial(stem, rules);
  const specularPixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      const props = evaluatePixel(r, g, b, a, material, options);

      const rOut = Math.max(0, Math.min(255, Math.round(props.smoothness)));
      const gOut = Math.max(0, Math.min(255, Math.round(props.f0)));
      const bOut = Math.max(0, Math.min(255, Math.round(props.porosity)));
      const aOut = Math.max(0, Math.min(254, Math.round(props.emission)));

      specularPixels[idx] = rOut;
      specularPixels[idx + 1] = gOut;
      specularPixels[idx + 2] = bOut;
      specularPixels[idx + 3] = aOut;
    }
  }

  let cachedSpecPng = null;
  Object.defineProperty(specularPixels, "png", {
    get() {
      if (!cachedSpecPng) cachedSpecPng = encodePng(width, height, specularPixels);
      return cachedSpecPng;
    },
    set(val) {
      cachedSpecPng = val;
    },
    configurable: true
  });

  if (options.encode === true) {
    const pngBuf = encodePng(width, height, specularPixels);
    pngBuf.pixels = specularPixels;
    return pngBuf;
  }

  return specularPixels;
}

export function generatePbrMaps(stem, pixels, width, height, options = {}) {
  const normalPixels = generateNormalMap(stem, pixels, width, height, { ...options, encode: false });
  const specularPixels = generateSpecularMap(stem, pixels, width, height, { ...options, encode: false });

  const normalPng = encodePng(width, height, normalPixels);
  const specularPng = encodePng(width, height, specularPixels);

  normalPng.pixels = normalPixels;
  specularPng.pixels = specularPixels;

  normalPixels.png = normalPng;
  specularPixels.png = specularPng;

  return {
    normalMap: normalPng,
    specularMap: specularPng,
    normalPixels,
    specularPixels
  };
}

// --------------------------------------------------------------------------
// Texture Discovery & Server Integration
// --------------------------------------------------------------------------

const pbrCache = new Map();

export function clearPbrCache() {
  pbrCache.clear();
}

export function normalizeMapType(mapType) {
  if (!mapType || typeof mapType !== "string") return null;
  const lower = mapType.trim().toLowerCase();
  if (lower === "normal" || lower === "n" || lower === "_n") return "normal";
  if (lower === "specular" || lower === "s" || lower === "_s") return "specular";
  return null;
}

export function findBlockTextureFile(blockId, options = {}) {
  const cleanStem = path.basename(blockId, path.extname(blockId));
  const candidateNames = [
    `${cleanStem}.svg`,
    `${cleanStem}.png`,
    blockId
  ];

  const searchDirs = [];
  if (options.texturesDir) searchDirs.push(options.texturesDir);
  searchDirs.push(path.join(ROOT_DIR, "textures"));
  searchDirs.push(path.resolve(ROOT_DIR, "..", "Keyframe", "textures"));
  searchDirs.push("D:/Projects/Ninja6-MC/Keyframe/textures");

  for (const dir of searchDirs) {
    if (!dir || !fs.existsSync(dir)) continue;

    for (const name of candidateNames) {
      const direct = path.join(dir, name);
      if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

      const blockPath = path.join(dir, "block", name);
      if (fs.existsSync(blockPath) && fs.statSync(blockPath).isFile()) return blockPath;

      const itemPath = path.join(dir, "item", name);
      if (fs.existsSync(itemPath) && fs.statSync(itemPath).isFile()) return itemPath;
    }
  }

  return null;
}

/**
 * Generates and returns a PNG buffer for a requested block and LabPBR mapType.
 * Supports 'normal' ('n') and 'specular' ('s').
 *
 * @param {string} blockId
 * @param {string} mapType
 * @param {object} [options]
 * @returns {Promise<Buffer|null>}
 */
export async function getPbrTexture(blockId, mapType, options = {}) {
  const normType = normalizeMapType(mapType);
  if (!normType) {
    throw new TypeError(
      `Invalid mapType "${mapType}". Supported types are "normal" ("n") and "specular" ("s").`
    );
  }

  if (!blockId || typeof blockId !== "string") {
    throw new TypeError("blockId must be a non-empty string");
  }

  const cleanStem = path.basename(blockId, path.extname(blockId));
  const resolution = options.resolution || options.res || 512;
  const cacheKey = `${cleanStem}:${normType}:${resolution}`;

  if (!options.noCache && pbrCache.has(cacheKey)) {
    return pbrCache.get(cacheKey);
  }

  let pixels = null;
  let width = 0;
  let height = 0;

  if (options.pixels) {
    pixels = Buffer.isBuffer(options.pixels) ? options.pixels : Buffer.from(options.pixels);
    width = options.width || 16;
    height = options.height || 16;
  } else if (options.svg) {
    const resvg = new Resvg(options.svg, {
      fitTo: { mode: "width", value: resolution }
    });
    const rendered = resvg.render();
    width = rendered.width;
    height = rendered.height;
    pixels = Buffer.from(rendered.pixels);
  } else {
    const filePath = findBlockTextureFile(blockId, options);
    if (!filePath) {
      return null;
    }
    const svgContent = fs.readFileSync(filePath, "utf-8");
    const resvg = new Resvg(svgContent, {
      fitTo: { mode: "width", value: resolution }
    });
    const rendered = resvg.render();
    width = rendered.width;
    height = rendered.height;
    pixels = Buffer.from(rendered.pixels);
  }

  const rules = options.rules || loadPbrRules(options.rulesPath);
  let pngBuffer;

  if (normType === "normal") {
    pngBuffer = generateNormalMap(cleanStem, pixels, width, height, { ...options, rules, encode: true });
  } else {
    pngBuffer = generateSpecularMap(cleanStem, pixels, width, height, { ...options, rules, encode: true });
  }

  if (!options.noCache) {
    pbrCache.set(cacheKey, pngBuffer);
  }

  return pngBuffer;
}

/**
 * Handles incoming HTTP request for /api/pbr/:blockId/:mapType.
 * Returns true if the request was handled, false otherwise.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {object} [options]
 * @returns {Promise<boolean>}
 */
export async function handlePbrRequest(req, res, options = {}) {
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  const match = pathname.match(/^\/api\/pbr\/([^/]+)\/([^/]+)\/?$/);
  if (!match) {
    if (pathname.startsWith("/api/pbr/")) {
      res.writeHead(400, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(`Bad Request: Path must follow /api/pbr/:blockId/:mapType`);
      return true;
    }
    return false;
  }

  const blockId = match[1];
  const rawMapType = match[2];

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      "Allow": "GET, HEAD",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(`Method Not Allowed: ${req.method}`);
    return true;
  }

  const normType = normalizeMapType(rawMapType);
  if (!normType) {
    res.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(`Invalid mapType "${rawMapType}". Must be 'normal' ('n') or 'specular' ('s').`);
    return true;
  }

  const resParam = parseInt(urlObj.searchParams.get("res") || urlObj.searchParams.get("resolution") || "512", 10);
  const requestOptions = {
    ...options,
    resolution: isNaN(resParam) || resParam <= 0 ? 512 : resParam
  };

  try {
    const pngBuffer = await getPbrTexture(blockId, normType, requestOptions);
    if (!pngBuffer) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(`Texture not found for block "${blockId}".`);
      return true;
    }

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": pngBuffer.length,
      "Cache-Control": options.cacheControl || "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    });

    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(pngBuffer);
    }
    return true;
  } catch (err) {
    console.error(`[PBR] Error generating PBR texture:`, err);
    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(`Internal Server Error`);
    return true;
  }
}
