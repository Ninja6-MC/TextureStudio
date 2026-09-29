/**
 * Minecraft Java Biome Environment Selector & Grayscale Compositor.
 *
 * Implements the UI selector for Biomes and the universal compositing pipeline
 * for top and side overhang grass textures across both local and external sets.
 */

import {
  getBiomeTint,
  calculateColormapCoordinates,
  getBiomeData,
  rgbToHex
} from "./biome-engine.js";
import {
  srgbToLinear,
  linearToSrgb
} from "./color-space.js";

// Standard preset biomes for the TextureStudio UI selector
export const BIOME_PRESETS = Object.freeze([
  Object.freeze({ id: "plains", label: "Plains" }),
  Object.freeze({ id: "forest", label: "Forest" }),
  Object.freeze({ id: "birch_forest", label: "Birch Forest" }),
  Object.freeze({ id: "dark_forest", label: "Dark Forest" }),
  Object.freeze({ id: "taiga", label: "Taiga" }),
  Object.freeze({ id: "swamp", label: "Swamp" }),
  Object.freeze({ id: "badlands", label: "Badlands / Mesa" }),
  Object.freeze({ id: "desert", label: "Desert" }),
  Object.freeze({ id: "savanna", label: "Savanna" }),
  Object.freeze({ id: "jungle", label: "Jungle" }),
  Object.freeze({ id: "snowy_plains", label: "Snowy Plains" })
]);

/**
 * Returns metadata, color swatch, and colormap coordinates for a given biome.
 *
 * @param {string} biomeId
 * @param {string} [category="grass"]
 * @returns {{ id: string, label: string, category: string, rgb: [number, number, number], hex: string, coordinates: object }}
 */
export function getBiomeSwatch(biomeId, category = "grass") {
  const biomeData = getBiomeData(biomeId);
  const rgb = getBiomeTint(biomeId, category);
  const hex = rgbToHex(...rgb);
  const coordinates = calculateColormapCoordinates(biomeData.temperature, biomeData.humidity);

  const preset = BIOME_PRESETS.find((p) => p.id === biomeData.id);
  const label = preset ? preset.label : biomeData.id;

  return {
    id: biomeData.id,
    label,
    category,
    rgb,
    hex,
    coordinates
  };
}

/**
 * Generates human-readable climate and colormap coordinate string for UI display.
 *
 * @param {string} biomeId
 * @returns {string} e.g. "T: 0.80, H: 0.40 (x: 51, y: 173)"
 */
export function formatBiomeCoordinates(biomeId) {
  const swatch = getBiomeSwatch(biomeId);
  const c = swatch.coordinates;
  return `T: ${c.temperature.toFixed(2)}, H: ${c.humidity.toFixed(2)} (x: ${c.x}, y: ${c.y})`;
}

/**
 * Universal gate determining whether a block face receives biome tinting.
 * Removes the restrictive isExternal gate so both local and external resource sets
 * receive authentic biome compositing.
 *
 * In Minecraft Java:
 * - Block id 'grass_block' receives grass colormap tinting on its top face (face index 2).
 * - Grayscale side overlays are tinted identically before compositing onto dirt.
 *
 * @param {string} blockId
 * @param {number|null} [faceIndex=null] - 2 for Top (+Y)
 * @returns {boolean}
 */
export function shouldApplyGrassTint(blockId, faceIndex = null) {
  if (typeof blockId !== "string") return false;
  const isGrass = blockId.trim().toLowerCase() === "grass_block";
  if (!isGrass) return false;
  if (faceIndex === null) return true;
  return faceIndex === 2;
}

/**
 * Universal gate determining whether grass side overlays should be composited.
 * Applies equally across local and external packs when overlays are enabled.
 *
 * @param {string} blockId
 * @param {string|boolean} hasSideOverlay - Path string or boolean indicating overlay presence
 * @param {boolean} [showOverlays=true]
 * @returns {boolean}
 */
export function shouldCompositeSideOverlay(blockId, hasSideOverlay, showOverlays = true) {
  if (typeof blockId !== "string") return false;
  const isGrass = blockId.trim().toLowerCase() === "grass_block";
  return isGrass && Boolean(hasSideOverlay) && Boolean(showOverlays);
}

/**
 * Tints a grayscale RGBA buffer (Uint8Array, Uint8ClampedArray, or Buffer) in-place
 * by multiplying RGB channels by normalized tint multipliers [r, g, b].
 * Supports linear-light math when options.linear is true.
 *
 * @param {Uint8Array|Uint8ClampedArray|Buffer} rgbaBuffer
 * @param {[number, number, number]} tintRgb - Normalized [r, g, b] float multipliers
 * @param {object|boolean} [options={}] - Options or boolean flag for linear mode
 * @returns {Uint8Array|Uint8ClampedArray|Buffer}
 */
export function tintGrayscaleBuffer(rgbaBuffer, tintRgb, options = {}) {
  if (!rgbaBuffer || !Array.isArray(tintRgb) || tintRgb.length < 3) {
    return rgbaBuffer;
  }

  const { linear = false } = typeof options === "boolean" ? { linear: options } : options;
  const [tr, tg, tb] = tintRgb;

  if (linear) {
    const tintLinR = srgbToLinear(tr);
    const tintLinG = srgbToLinear(tg);
    const tintLinB = srgbToLinear(tb);

    for (let i = 0; i < rgbaBuffer.length; i += 4) {
      if (rgbaBuffer[i + 3] > 0) {
        const linR = srgbToLinear(rgbaBuffer[i] / 255) * tintLinR;
        const linG = srgbToLinear(rgbaBuffer[i + 1] / 255) * tintLinG;
        const linB = srgbToLinear(rgbaBuffer[i + 2] / 255) * tintLinB;

        rgbaBuffer[i] = Math.min(255, Math.max(0, Math.round(linearToSrgb(linR) * 255)));
        rgbaBuffer[i + 1] = Math.min(255, Math.max(0, Math.round(linearToSrgb(linG) * 255)));
        rgbaBuffer[i + 2] = Math.min(255, Math.max(0, Math.round(linearToSrgb(linB) * 255)));
      }
    }
    return rgbaBuffer;
  }

  for (let i = 0; i < rgbaBuffer.length; i += 4) {
    if (rgbaBuffer[i + 3] > 0) {
      rgbaBuffer[i] = Math.min(255, Math.round(rgbaBuffer[i] * tr));
      rgbaBuffer[i + 1] = Math.min(255, Math.round(rgbaBuffer[i + 1] * tg));
      rgbaBuffer[i + 2] = Math.min(255, Math.round(rgbaBuffer[i + 2] * tb));
    }
  }

  return rgbaBuffer;
}

/**
 * Composites a tinted grass side overlay onto a base dirt texture buffer.
 * Performs alpha blending: Result = (Overlay_Tinted * alpha) + (Dirt * (1 - alpha)).
 * Harmonizes overlay tinting using linear-light multiplication matching Three.js SRGBColorSpace.
 *
 * @param {Uint8Array|Uint8ClampedArray|Buffer} baseDirtRgba
 * @param {Uint8Array|Uint8ClampedArray|Buffer} overlayRgba
 * @param {[number, number, number]} tintRgb - Normalized [r, g, b] float multipliers
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} Composited RGBA buffer
 */
export function compositeGrassSideBuffers(baseDirtRgba, overlayRgba, tintRgb, width, height) {
  const pixelCount = width * height;
  const byteLength = pixelCount * 4;
  const output = new Uint8Array(byteLength);

  const [tr, tg, tb] = tintRgb || [1.0, 1.0, 1.0];
  const tintLinR = srgbToLinear(tr);
  const tintLinG = srgbToLinear(tg);
  const tintLinB = srgbToLinear(tb);

  for (let i = 0; i < byteLength; i += 4) {
    const dirtR = baseDirtRgba ? baseDirtRgba[i] : 0;
    const dirtG = baseDirtRgba ? baseDirtRgba[i + 1] : 0;
    const dirtB = baseDirtRgba ? baseDirtRgba[i + 2] : 0;
    const dirtA = baseDirtRgba ? baseDirtRgba[i + 3] : 255;

    const overA = overlayRgba ? overlayRgba[i + 3] : 0;

    if (overA === 0) {
      output[i] = dirtR;
      output[i + 1] = dirtG;
      output[i + 2] = dirtB;
      output[i + 3] = dirtA;
    } else {
      const overLinR = srgbToLinear(overlayRgba[i] / 255);
      const overLinG = srgbToLinear(overlayRgba[i + 1] / 255);
      const overLinB = srgbToLinear(overlayRgba[i + 2] / 255);

      const tintedLinR = overLinR * tintLinR;
      const tintedLinG = overLinG * tintLinG;
      const tintedLinB = overLinB * tintLinB;

      const tintedByteR = Math.min(255, Math.max(0, Math.round(linearToSrgb(tintedLinR) * 255)));
      const tintedByteG = Math.min(255, Math.max(0, Math.round(linearToSrgb(tintedLinG) * 255)));
      const tintedByteB = Math.min(255, Math.max(0, Math.round(linearToSrgb(tintedLinB) * 255)));

      if (overA === 255) {
        output[i] = tintedByteR;
        output[i + 1] = tintedByteG;
        output[i + 2] = tintedByteB;
        output[i + 3] = 255;
      } else {
        const alpha = overA / 255;
        const invAlpha = 1 - alpha;

        output[i] = Math.min(255, Math.round(tintedByteR * alpha + dirtR * invAlpha));
        output[i + 1] = Math.min(255, Math.round(tintedByteG * alpha + dirtG * invAlpha));
        output[i + 2] = Math.min(255, Math.round(tintedByteB * alpha + dirtB * invAlpha));
        output[i + 3] = Math.min(255, Math.round(overA + dirtA * invAlpha));
      }
    }
  }

  return output;
}

/**
 * Biome UI selector and state controller for client-side environments.
 */
export class BiomeSelectorUI {
  /**
   * @param {object} options
   * @param {HTMLElement} [options.container]
   * @param {string} [options.initialBiome="plains"]
   * @param {Function} [options.onBiomeChange]
   */
  constructor({ container = null, initialBiome = "plains", onBiomeChange = null } = {}) {
    this.currentBiome = initialBiome;
    this.onBiomeChange = onBiomeChange;
    this.container = container;
    this.dom = {
      select: null,
      swatch: null,
      coords: null
    };

    if (container) {
      this.mount(container);
    }
  }

  /**
   * Mounts the selector controls to a container element.
   *
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container || typeof document === "undefined") return;
    this.container = container;
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "control-item biome-selector-container";

    const label = document.createElement("label");
    label.htmlFor = "biome-select";
    label.textContent = "Biome Tint";

    const select = document.createElement("select");
    select.id = "biome-select";
    select.className = "styled-select";

    for (const preset of BIOME_PRESETS) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      if (preset.id === this.currentBiome) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    const previewRow = document.createElement("div");
    previewRow.className = "biome-preview-row";
    previewRow.style.display = "flex";
    previewRow.style.alignItems = "center";
    previewRow.style.gap = "6px";
    previewRow.style.marginTop = "4px";

    const swatch = document.createElement("div");
    swatch.id = "biome-swatch";
    swatch.className = "biome-swatch";
    swatch.style.width = "14px";
    swatch.style.height = "14px";
    swatch.style.borderRadius = "3px";
    swatch.style.border = "1px solid rgba(255, 255, 255, 0.2)";

    const coords = document.createElement("span");
    coords.id = "biome-coords";
    coords.className = "biome-coords";
    coords.style.fontSize = "11px";
    coords.style.color = "#8b949e";

    previewRow.appendChild(swatch);
    previewRow.appendChild(coords);

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    wrapper.appendChild(previewRow);
    this.container.appendChild(wrapper);

    this.dom.select = select;
    this.dom.swatch = swatch;
    this.dom.coords = coords;

    select.addEventListener("change", (e) => {
      this.setBiome(e.target.value);
    });

    this.updateDisplay();
  }

  /**
   * Sets the active biome and notifies listeners.
   *
   * @param {string} biomeId
   */
  setBiome(biomeId) {
    this.currentBiome = biomeId;
    this.updateDisplay();

    if (typeof this.onBiomeChange === "function") {
      const swatch = getBiomeSwatch(this.currentBiome);
      this.onBiomeChange(this.currentBiome, swatch.rgb, swatch);
    }
  }

  /**
   * Updates UI swatch and coordinates display to reflect the active biome.
   */
  updateDisplay() {
    const swatch = getBiomeSwatch(this.currentBiome);
    if (this.dom.select && this.dom.select.value !== this.currentBiome) {
      this.dom.select.value = this.currentBiome;
    }
    if (this.dom.swatch) {
      this.dom.swatch.style.backgroundColor = swatch.hex;
      this.dom.swatch.title = `Biome: ${swatch.label} (${swatch.hex})`;
    }
    if (this.dom.coords) {
      this.dom.coords.textContent = formatBiomeCoordinates(this.currentBiome);
    }
  }
}
