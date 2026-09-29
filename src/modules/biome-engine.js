/**
 * Minecraft Java Biome Colormap Math & Dynamic Tinting Engine.
 *
 * Implements authentic Minecraft Java colormap coordinate calculation and
 * sampling from standard 256x256 grass and foliage colormaps, along with
 * hardcoded biome overrides (Badlands/Mesa, Swamp).
 */

const COLORMAP_SIZE = 256;

// Biome overrides specified by Minecraft Java Edition
export const BIOME_OVERRIDES = Object.freeze({
  badlands: Object.freeze({
    grass: "#90814d",
    foliage: "#9e814d"
  }),
  mesa: Object.freeze({
    grass: "#90814d",
    foliage: "#9e814d"
  }),
  eroded_badlands: Object.freeze({
    grass: "#90814d",
    foliage: "#9e814d"
  }),
  wooded_badlands: Object.freeze({
    grass: "#90814d",
    foliage: "#9e814d"
  }),
  swamp: Object.freeze({
    grass: "#6a7039",
    foliage: "#6a7039"
  }),
  swampland: Object.freeze({
    grass: "#6a7039",
    foliage: "#6a7039"
  }),
  mangrove_swamp: Object.freeze({
    grass: "#6a7039",
    foliage: "#6a7039"
  })
});

// Standard Minecraft Java Biome Climate Registry
export const BIOMES = Object.freeze({
  plains: Object.freeze({ id: "plains", temperature: 0.8, humidity: 0.4 }),
  sunflower_plains: Object.freeze({ id: "sunflower_plains", temperature: 0.8, humidity: 0.4 }),
  forest: Object.freeze({ id: "forest", temperature: 0.7, humidity: 0.8 }),
  flower_forest: Object.freeze({ id: "flower_forest", temperature: 0.7, humidity: 0.8 }),
  birch_forest: Object.freeze({ id: "birch_forest", temperature: 0.6, humidity: 0.6 }),
  old_growth_birch_forest: Object.freeze({ id: "old_growth_birch_forest", temperature: 0.6, humidity: 0.6 }),
  dark_forest: Object.freeze({ id: "dark_forest", temperature: 0.7, humidity: 0.8 }),
  taiga: Object.freeze({ id: "taiga", temperature: 0.25, humidity: 0.8 }),
  old_growth_pine_taiga: Object.freeze({ id: "old_growth_pine_taiga", temperature: 0.3, humidity: 0.8 }),
  old_growth_spruce_taiga: Object.freeze({ id: "old_growth_spruce_taiga", temperature: 0.25, humidity: 0.8 }),
  snowy_taiga: Object.freeze({ id: "snowy_taiga", temperature: -0.5, humidity: 0.4 }),
  snowy_plains: Object.freeze({ id: "snowy_plains", temperature: 0.0, humidity: 0.5 }),
  snowy_tundra: Object.freeze({ id: "snowy_tundra", temperature: 0.0, humidity: 0.5 }),
  ice_spikes: Object.freeze({ id: "ice_spikes", temperature: 0.0, humidity: 0.5 }),
  desert: Object.freeze({ id: "desert", temperature: 2.0, humidity: 0.0 }),
  savanna: Object.freeze({ id: "savanna", temperature: 2.0, humidity: 0.0 }),
  savanna_plateau: Object.freeze({ id: "savanna_plateau", temperature: 2.0, humidity: 0.0 }),
  windswept_savanna: Object.freeze({ id: "windswept_savanna", temperature: 1.1, humidity: 0.0 }),
  jungle: Object.freeze({ id: "jungle", temperature: 0.95, humidity: 0.9 }),
  sparse_jungle: Object.freeze({ id: "sparse_jungle", temperature: 0.95, humidity: 0.8 }),
  bamboo_jungle: Object.freeze({ id: "bamboo_jungle", temperature: 0.95, humidity: 0.9 }),
  badlands: Object.freeze({ id: "badlands", temperature: 2.0, humidity: 0.0, hasOverride: true }),
  mesa: Object.freeze({ id: "mesa", temperature: 2.0, humidity: 0.0, hasOverride: true }),
  swamp: Object.freeze({ id: "swamp", temperature: 0.8, humidity: 0.9, hasOverride: true }),
  swampland: Object.freeze({ id: "swampland", temperature: 0.8, humidity: 0.9, hasOverride: true }),
  mangrove_swamp: Object.freeze({ id: "mangrove_swamp", temperature: 0.8, humidity: 0.9, hasOverride: true }),
  meadow: Object.freeze({ id: "meadow", temperature: 0.5, humidity: 0.8 }),
  grove: Object.freeze({ id: "grove", temperature: -0.2, humidity: 0.8 }),
  cherry_grove: Object.freeze({ id: "cherry_grove", temperature: 0.5, humidity: 0.8 }),
  snowy_slopes: Object.freeze({ id: "snowy_slopes", temperature: -0.3, humidity: 0.9 }),
  jagged_peaks: Object.freeze({ id: "jagged_peaks", temperature: -0.7, humidity: 0.9 }),
  frozen_peaks: Object.freeze({ id: "frozen_peaks", temperature: -0.7, humidity: 0.9 }),
  stony_peaks: Object.freeze({ id: "stony_peaks", temperature: 1.0, humidity: 0.3 }),
  river: Object.freeze({ id: "river", temperature: 0.5, humidity: 0.5 }),
  frozen_river: Object.freeze({ id: "frozen_river", temperature: 0.0, humidity: 0.5 }),
  beach: Object.freeze({ id: "beach", temperature: 0.8, humidity: 0.4 }),
  snowy_beach: Object.freeze({ id: "snowy_beach", temperature: 0.05, humidity: 0.3 }),
  stony_shore: Object.freeze({ id: "stony_shore", temperature: 0.2, humidity: 0.3 }),
  warm_ocean: Object.freeze({ id: "warm_ocean", temperature: 0.5, humidity: 0.5 }),
  lukewarm_ocean: Object.freeze({ id: "lukewarm_ocean", temperature: 0.5, humidity: 0.5 }),
  ocean: Object.freeze({ id: "ocean", temperature: 0.5, humidity: 0.5 }),
  cold_ocean: Object.freeze({ id: "cold_ocean", temperature: 0.5, humidity: 0.5 }),
  deep_cold_ocean: Object.freeze({ id: "deep_cold_ocean", temperature: 0.5, humidity: 0.5 }),
  frozen_ocean: Object.freeze({ id: "frozen_ocean", temperature: 0.0, humidity: 0.5 }),
  mushroom_fields: Object.freeze({ id: "mushroom_fields", temperature: 0.9, humidity: 1.0 }),
  dripstone_caves: Object.freeze({ id: "dripstone_caves", temperature: 0.8, humidity: 0.4 }),
  lush_caves: Object.freeze({ id: "lush_caves", temperature: 0.5, humidity: 0.5 }),
  deep_dark: Object.freeze({ id: "deep_dark", temperature: 0.8, humidity: 0.4 })
});

// In-memory colormap pixel buffers: key -> Uint8Array(256 * 256 * 4)
const colormapBuffers = new Map();

/**
 * Clamps a numeric scalar between a minimum and maximum bound.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts a hex color string to normalized RGB float array [r, g, b].
 *
 * @param {string} hex - e.g. '#90814d' or '90814d'
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  if (typeof hex !== "string") {
    return [1.0, 1.0, 1.0];
  }
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length !== 6) {
    return [1.0, 1.0, 1.0];
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Converts normalized RGB floats [r, g, b] to a lowercase hex string.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  const ir = Math.round(clamp(r, 0, 1) * 255);
  const ig = Math.round(clamp(g, 0, 1) * 255);
  const ib = Math.round(clamp(b, 0, 1) * 255);
  return `#${ir.toString(16).padStart(2, "0")}${ig.toString(16).padStart(2, "0")}${ib.toString(16).padStart(2, "0")}`;
}

/**
 * Calculates normalized texture coordinates (u, v) and discrete pixel indices (x, y)
 * on a 256x256 colormap from temperature and humidity.
 *
 * Math specification:
 * - T_clamped = clamp(temperature, 0.0, 1.0)
 * - H_clamped = clamp(humidity, 0.0, 1.0) * T_clamped
 * - u = 1.0 - T_clamped
 * - v = 1.0 - H_clamped
 * - x = clamp(floor(u * 255), 0, 255)
 * - y = clamp(floor(v * 255), 0, 255)
 *
 * @param {number} temperature
 * @param {number} humidity
 * @returns {{ u: number, v: number, x: number, y: number, temperature: number, humidity: number }}
 */
export function calculateColormapCoordinates(temperature, humidity) {
  const tempClamped = clamp(temperature, 0.0, 1.0);
  const humidityClamped = clamp(humidity, 0.0, 1.0) * tempClamped;

  const u = Math.round((1.0 - tempClamped) * 1e6) / 1e6;
  const v = Math.round((1.0 - humidityClamped) * 1e6) / 1e6;

  const x = Math.min(COLORMAP_SIZE - 1, Math.max(0, Math.floor(u * 255.0)));
  const y = Math.min(COLORMAP_SIZE - 1, Math.max(0, Math.floor(v * 255.0)));

  return {
    u,
    v,
    x,
    y,
    temperature: tempClamped,
    humidity: humidityClamped
  };
}

/**
 * Normalizes a raw biome identifier string into a canonical ID key.
 *
 * @param {string} biomeId
 * @returns {string}
 */
export function normalizeBiomeId(biomeId) {
  if (typeof biomeId !== "string") return "plains";
  let clean = biomeId.trim().toLowerCase();
  if (clean.startsWith("minecraft:")) {
    clean = clean.substring("minecraft:".length);
  }
  return clean;
}

/**
 * Retrieves climate data and override configuration for a given biome.
 *
 * @param {string} biomeId
 * @returns {object}
 */
export function getBiomeData(biomeId) {
  const canonicalId = normalizeBiomeId(biomeId);
  const entry = BIOMES[canonicalId];
  if (entry) {
    return {
      ...entry,
      hasOverride: Boolean(BIOME_OVERRIDES[canonicalId]),
      overrides: BIOME_OVERRIDES[canonicalId] || null
    };
  }
  if (BIOME_OVERRIDES[canonicalId]) {
    return {
      id: canonicalId,
      temperature: 0.8,
      humidity: 0.4,
      hasOverride: true,
      overrides: BIOME_OVERRIDES[canonicalId]
    };
  }
  return {
    id: "plains",
    temperature: 0.8,
    humidity: 0.4,
    hasOverride: false,
    overrides: null
  };
}

/**
 * Minimal pure Node.js PNG decoder for RGB/RGBA uncompressed/IDAT buffers.
 *
 * @param {Buffer|Uint8Array} buf
 * @param {object} zlibInstance
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
function decodePngSync(buf, zlibInstance) {
  let offset = 8;
  const idatChunks = [];
  let width = 0;
  let height = 0;
  let colorType = 0;

  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);

  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IHDR") {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      colorType = buffer[offset + 17];
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }

  if (!zlibInstance || idatChunks.length === 0) {
    throw new Error("Unable to decode PNG: missing IDAT data or zlib");
  }

  const decompressed = zlibInstance.inflateSync(Buffer.concat(idatChunks));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = 1 + width * bpp;
  const outData = new Uint8Array(width * height * 4);
  let prevRow = new Uint8Array(width * bpp);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const filter = decompressed[rowStart];
    const currentRow = new Uint8Array(width * bpp);

    for (let x = 0; x < width * bpp; x++) {
      const byte = decompressed[rowStart + 1 + x];
      const left = x >= bpp ? currentRow[x - bpp] : 0;
      const up = prevRow[x];
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;
      let val = 0;

      if (filter === 0) {
        val = byte;
      } else if (filter === 1) {
        val = (byte + left) & 0xff;
      } else if (filter === 2) {
        val = (byte + up) & 0xff;
      } else if (filter === 3) {
        val = (byte + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (byte + pr) & 0xff;
      }
      currentRow[x] = val;
    }
    prevRow = currentRow;

    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      const src = x * bpp;
      outData[dst] = currentRow[src];
      outData[dst + 1] = currentRow[src + 1];
      outData[dst + 2] = currentRow[src + 2];
      outData[dst + 3] = bpp === 4 ? currentRow[src + 3] : 255;
    }
  }

  return { width, height, data: outData };
}

/**
 * Registers an in-memory RGBA pixel buffer for a colormap category ('grass' or 'foliage').
 * Buffer must contain at least 256 * 256 * 4 bytes.
 *
 * @param {string} category - 'grass' | 'foliage'
 * @param {Uint8Array|Uint8ClampedArray|Buffer|ImageData} pixelBuffer
 * @param {number} [width]
 * @param {number} [height]
 */
export function registerColormap(category, pixelBuffer, width, height) {
  if (typeof category !== "string" || !pixelBuffer) return;
  const key = category.trim().toLowerCase();
  const buffer = pixelBuffer.data || pixelBuffer;
  colormapBuffers.set(key, buffer);
}

/**
 * Checks whether an in-memory colormap pixel buffer is registered for a category.
 *
 * @param {string} category - 'grass' | 'foliage'
 * @returns {boolean}
 */
export function hasColormap(category) {
  if (typeof category !== "string") return false;
  return colormapBuffers.has(category.trim().toLowerCase());
}

/**
 * Retrieves the raw registered colormap pixel buffer for a category, if loaded.
 *
 * @param {string} category - 'grass' | 'foliage'
 * @returns {Uint8Array|Uint8ClampedArray|null}
 */
export function getColormapBuffer(category) {
  if (typeof category !== "string") return null;
  return colormapBuffers.get(category.trim().toLowerCase()) || null;
}

/**
 * Clears all registered colormap pixel buffers.
 * Primarily used for unit testing or dynamic pack reloads.
 */
export function clearColormaps() {
  colormapBuffers.clear();
}

/**
 * Retrieves the normalized [r, g, b] float color at pixel coordinate (x, y)
 * from the registered colormap category.
 *
 * @param {string} category - 'grass' | 'foliage'
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number]}
 */
export function getColormapPixel(category, x, y) {
  const key = (category || "grass").trim().toLowerCase();
  const buffer = colormapBuffers.get(key);

  const cx = Math.min(COLORMAP_SIZE - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(COLORMAP_SIZE - 1, Math.max(0, Math.floor(y)));

  if (buffer && buffer.length >= COLORMAP_SIZE * COLORMAP_SIZE * 4) {
    const idx = (cy * COLORMAP_SIZE + cx) * 4;
    return [buffer[idx] / 255, buffer[idx + 1] / 255, buffer[idx + 2] / 255];
  }

  // Fallback defaults if colormap texture has not yet loaded
  if (key === "foliage") {
    return hexToRgb("#77ab2f");
  }
  return hexToRgb("#91bd59");
}

/**
 * Decodes a binary image payload into a rasterizable image source (ImageBitmap or HTMLImageElement).
 *
 * @param {Blob|ArrayBuffer} blobOrBuffer
 * @param {string} url
 * @param {object} [options={}]
 * @returns {Promise<{source: ImageBitmap|HTMLImageElement, isBitmap: boolean, width: number, height: number}>}
 */
async function decodeImageSource(blobOrBuffer, url, options = {}) {
  const createBitmapFn = options.createImageBitmap || (typeof createImageBitmap === "function" ? createImageBitmap : null);
  if (typeof createBitmapFn === "function") {
    try {
      const bitmap = await createBitmapFn(blobOrBuffer);
      return {
        source: bitmap,
        isBitmap: true,
        width: bitmap.width || COLORMAP_SIZE,
        height: bitmap.height || COLORMAP_SIZE
      };
    } catch {
      // Fallback to Image constructor
    }
  }

  const ImageCtor = options.Image || (typeof Image !== "undefined" ? Image : (typeof window !== "undefined" ? window.Image : null));
  if (ImageCtor) {
    let srcUrl = url;
    let objectUrl = null;
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof Blob !== "undefined" && blobOrBuffer instanceof Blob) {
      try {
        objectUrl = URL.createObjectURL(blobOrBuffer);
        srcUrl = objectUrl;
      } catch {}
    }

    try {
      const img = await new Promise((resolve, reject) => {
        const image = new ImageCtor();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load colormap image from ${url}`));
        image.src = srcUrl;
      });
      return {
        source: img,
        isBitmap: false,
        width: img.naturalWidth || img.width || COLORMAP_SIZE,
        height: img.naturalHeight || img.height || COLORMAP_SIZE
      };
    } finally {
      if (objectUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  throw new Error("No image decoder available (neither createImageBitmap nor Image constructor found)");
}

/**
 * Creates a 2D rendering canvas context across OffscreenCanvas, HTMLCanvasElement, or custom factory.
 *
 * @param {number} width
 * @param {number} height
 * @param {object} [options={}]
 * @returns {{canvas: HTMLCanvasElement|OffscreenCanvas, ctx: CanvasRenderingContext2D}}
 */
function createCanvasContext(width, height, options = {}) {
  let canvas = null;
  if (typeof options.createCanvas === "function") {
    canvas = options.createCanvas(width, height);
  } else if (typeof options.OffscreenCanvas === "function") {
    canvas = new options.OffscreenCanvas(width, height);
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
  } else {
    const doc = options.document || (typeof document !== "undefined" ? document : (typeof window !== "undefined" ? window.document : null));
    if (doc && typeof doc.createElement === "function") {
      canvas = doc.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
    }
  }

  if (!canvas) {
    throw new Error("No Canvas2D or OffscreenCanvas implementation available");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire 2D context from canvas");
  }

  return { canvas, ctx };
}

/**
 * Rasterizes an image source onto a 2D canvas and extracts the RGBA pixel array.
 *
 * @param {{source: any, isBitmap: boolean, width: number, height: number}} sourceInfo
 * @param {object} [options={}]
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function rasterizeImageSource(sourceInfo, options = {}) {
  const { source, isBitmap, width, height } = sourceInfo;
  try {
    const { canvas, ctx } = createCanvasContext(width, height, options);
    ctx.drawImage(source, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data || imgData;
    return { data, width, height };
  } finally {
    if (isBitmap && typeof source.close === "function") {
      source.close();
    }
  }
}

/**
 * Loads and rasterizes a colormap texture in browser runtime via fetch and Canvas2D,
 * registering the resulting Uint8ClampedArray in colormapBuffers.
 *
 * @param {string} category - 'grass' | 'foliage'
 * @param {string} url - URL or relative path to the colormap PNG asset
 * @param {object} [options={}]
 * @returns {Promise<{category: string, data: Uint8ClampedArray, width: number, height: number}>}
 */
export async function loadBrowserColormap(category, url, options = {}) {
  const fetchFn = options.fetch || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) {
    throw new Error("No fetch implementation available");
  }

  const res = await fetchFn(url);
  if (!res || !res.ok) {
    const status = res ? res.status : "unknown";
    throw new Error(`Failed to fetch colormap '${category}' from ${url} (HTTP ${status})`);
  }

  let blobOrBuffer;
  if (typeof res.blob === "function") {
    blobOrBuffer = await res.blob();
  } else if (typeof res.arrayBuffer === "function") {
    blobOrBuffer = await res.arrayBuffer();
  } else {
    blobOrBuffer = res;
  }

  const sourceInfo = await decodeImageSource(blobOrBuffer, url, options);
  const rasterized = rasterizeImageSource(sourceInfo, options);

  registerColormap(category, rasterized.data, rasterized.width, rasterized.height);

  return {
    category,
    data: rasterized.data,
    width: rasterized.width,
    height: rasterized.height
  };
}

/**
 * Preloads standard vanilla grass and foliage colormaps in browser runtime via fetch and Canvas2D.
 *
 * @param {object} [options={}]
 * @returns {Promise<{success: boolean, grass: boolean, foliage: boolean, error?: Error}>}
 */
async function preloadStandardColormapsBrowser(options = {}) {
  let baseUrl = options.baseUrl;
  if (!baseUrl) {
    if (typeof import.meta !== "undefined" && import.meta.url && !import.meta.url.startsWith("file:")) {
      try {
        baseUrl = new URL("../assets/colormap/", import.meta.url).href;
      } catch {}
    }
    if (!baseUrl) {
      baseUrl = "src/assets/colormap/";
    }
  }
  const baseNormalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  const grassCandidates = [
    options.grassUrl,
    `${baseNormalized}grass.png`,
    "/src/assets/colormap/grass.png",
    "src/assets/colormap/grass.png"
  ].filter(Boolean);

  const foliageCandidates = [
    options.foliageUrl,
    `${baseNormalized}foliage.png`,
    "/src/assets/colormap/foliage.png",
    "src/assets/colormap/foliage.png"
  ].filter(Boolean);

  const uniqueGrass = [...new Set(grassCandidates)];
  const uniqueFoliage = [...new Set(foliageCandidates)];

  let lastError = null;

  if (!colormapBuffers.has("grass") || options.reload) {
    let loaded = false;
    for (const url of uniqueGrass) {
      try {
        await loadBrowserColormap("grass", url, options);
        loaded = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!loaded && options.throwOnError) {
      throw lastError || new Error("Failed to load grass colormap");
    }
  }

  if (!colormapBuffers.has("foliage") || options.reload) {
    let loaded = false;
    for (const url of uniqueFoliage) {
      try {
        await loadBrowserColormap("foliage", url, options);
        loaded = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!loaded && options.throwOnError) {
      throw lastError || new Error("Failed to load foliage colormap");
    }
  }

  return {
    success: colormapBuffers.has("grass") && colormapBuffers.has("foliage"),
    grass: colormapBuffers.has("grass"),
    foliage: colormapBuffers.has("foliage"),
    error: lastError
  };
}

/**
 * Preloads standard vanilla grass and foliage colormaps from disk in Node.js runtime.
 *
 * @param {object} [options={}]
 * @returns {Promise<{success: boolean, grass: boolean, foliage: boolean}>}
 */
async function preloadStandardColormapsNode(options = {}) {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const zlib = await import("node:zlib");
    const { fileURLToPath } = await import("node:url");

    const currentFilename = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilename);
    const rootDir = path.resolve(currentDir, "..", "..");

    const candidatePaths = [
      path.join(rootDir, "src", "assets", "colormap"),
      path.join(rootDir, "cache", "packs", "Vanilla_Default_16x", "assets", "minecraft", "textures", "colormap")
    ];

    for (const dir of candidatePaths) {
      const grassPath = path.join(dir, "grass.png");
      const foliagePath = path.join(dir, "foliage.png");

      if ((!colormapBuffers.has("grass") || options.reload) && fs.existsSync(grassPath)) {
        const decoded = decodePngSync(fs.readFileSync(grassPath), zlib);
        registerColormap("grass", decoded.data, decoded.width, decoded.height);
      }
      if ((!colormapBuffers.has("foliage") || options.reload) && fs.existsSync(foliagePath)) {
        const decoded = decodePngSync(fs.readFileSync(foliagePath), zlib);
        registerColormap("foliage", decoded.data, decoded.width, decoded.height);
      }

      if (colormapBuffers.has("grass") && colormapBuffers.has("foliage")) {
        break;
      }
    }
  } catch (err) {
    if (options.throwOnError) throw err;
    // Graceful fallback to default values in constrained environments
  }

  return {
    success: colormapBuffers.has("grass") && colormapBuffers.has("foliage"),
    grass: colormapBuffers.has("grass"),
    foliage: colormapBuffers.has("foliage")
  };
}

/**
 * Initializes and preloads standard vanilla grass and foliage colormaps.
 *
 * When running in Node.js, loads PNGs from disk via fs and zlib.
 * When running in browser, fetches PNGs via fetch and rasterizes via Canvas2D.
 *
 * @param {object|string} [options={}] - Options or baseUrl string
 * @returns {Promise<{success: boolean, grass: boolean, foliage: boolean, error?: Error}>}
 */
export async function preloadStandardColormaps(options = {}) {
  const opts = typeof options === "string" ? { baseUrl: options } : (options || {});

  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  const isBrowserExplicit = Boolean(
    opts.forceBrowser ||
    opts.isBrowser ||
    opts.fetch ||
    opts.createCanvas ||
    opts.Image ||
    opts.createImageBitmap ||
    opts.document
  );
  const isNodeExplicit = Boolean(opts.forceNode || opts.isNode);
  const inBrowser = typeof window !== "undefined" || typeof document !== "undefined" || !isNode;

  if ((inBrowser || isBrowserExplicit) && !isNodeExplicit) {
    return preloadStandardColormapsBrowser(opts);
  }

  return preloadStandardColormapsNode(opts);
}

// Auto-initialize standard colormaps in Node.js environment
if (typeof process !== "undefined" && process.versions?.node) {
  await preloadStandardColormaps();
} else if (typeof window !== "undefined" || typeof document !== "undefined") {
  preloadStandardColormaps().catch(() => {});
}

/**
 * Evaluates the biome tint for a given biome identifier and tint category.
 *
 * Applies hardcoded biome overrides first (Badlands/Mesa, Swamp), then
 * maps temperature and humidity to colormap coordinates and samples
 * the corresponding pixel.
 *
 * @param {string|object} biomeInput - Biome name string or object with { temperature, humidity }
 * @param {string} [tintCategory='grass'] - 'grass' | 'foliage'
 * @returns {[number, number, number]} Normalized [r, g, b] array
 */
export function getBiomeTint(biomeInput, tintCategory = "grass") {
  const category = typeof tintCategory === "string" ? tintCategory.trim().toLowerCase() : "grass";
  const validCategory = category === "foliage" ? "foliage" : "grass";

  // Check hardcoded overrides when biomeInput is a string ID
  if (typeof biomeInput === "string") {
    const canonicalId = normalizeBiomeId(biomeInput);
    const override = BIOME_OVERRIDES[canonicalId];
    if (override && override[validCategory]) {
      return hexToRgb(override[validCategory]);
    }
  }

  // Resolve climate parameters
  let temp = 0.8;
  let humidity = 0.4;

  if (typeof biomeInput === "object" && biomeInput !== null) {
    if (typeof biomeInput.temperature === "number") temp = biomeInput.temperature;
    if (typeof biomeInput.humidity === "number") humidity = biomeInput.humidity;
  } else if (typeof biomeInput === "string") {
    const biomeData = getBiomeData(biomeInput);
    temp = biomeData.temperature;
    humidity = biomeData.humidity;
  }

  // Calculate coordinates and sample colormap
  const coords = calculateColormapCoordinates(temp, humidity);
  return getColormapPixel(validCategory, coords.x, coords.y);
}
