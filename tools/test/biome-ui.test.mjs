import test from "node:test";
import assert from "node:assert/strict";
import {
  BIOME_PRESETS,
  getBiomeSwatch,
  formatBiomeCoordinates,
  shouldApplyGrassTint,
  shouldCompositeSideOverlay,
  tintGrayscaleBuffer,
  compositeGrassSideBuffers,
  BiomeSelectorUI
} from "../../src/modules/biome-ui.js";

test("BIOME_PRESETS contains all required Minecraft Java biomes", () => {
  const ids = BIOME_PRESETS.map((p) => p.id);
  const required = [
    "plains",
    "savanna",
    "swamp",
    "jungle",
    "badlands",
    "dark_forest",
    "desert"
  ];

  for (const req of required) {
    assert.ok(ids.includes(req), `Missing required biome preset: ${req}`);
  }

  for (const preset of BIOME_PRESETS) {
    assert.ok(preset.id && typeof preset.id === "string");
    assert.ok(preset.label && typeof preset.label === "string");
  }
});

test("getBiomeSwatch returns correct hex, normalized rgb, and coordinates", () => {
  const plainsSwatch = getBiomeSwatch("plains");
  assert.equal(plainsSwatch.id, "plains");
  assert.equal(plainsSwatch.label, "Plains");
  assert.equal(plainsSwatch.hex, "#91bd59");
  assert.equal(plainsSwatch.rgb[0].toFixed(3), (145 / 255).toFixed(3));
  assert.equal(plainsSwatch.coordinates.x, 51);
  assert.equal(plainsSwatch.coordinates.y, 173);

  const badlandsSwatch = getBiomeSwatch("badlands");
  assert.equal(badlandsSwatch.hex, "#90814d");

  const swampSwatch = getBiomeSwatch("swamp");
  assert.equal(swampSwatch.hex, "#6a7039");

  const foliageSwatch = getBiomeSwatch("plains", "foliage");
  assert.equal(foliageSwatch.hex, "#77ab2f");
});

test("formatBiomeCoordinates formats climate and pixel positions clearly", () => {
  const formatted = formatBiomeCoordinates("plains");
  assert.match(formatted, /^T: 0\.80, H: 0\.32 \(x: 51, y: 173\)$/);
});

test("shouldApplyGrassTint enables tinting universally without isExternal gating", () => {
  // Top face (+Y is index 2) of grass_block
  assert.equal(shouldApplyGrassTint("grass_block", 2), true);
  // General grass_block without specific face index specified
  assert.equal(shouldApplyGrassTint("grass_block"), true);
  // Side and bottom faces without overlay do not receive direct top tint
  assert.equal(shouldApplyGrassTint("grass_block", 0), false);
  assert.equal(shouldApplyGrassTint("grass_block", 3), false);

  // Other blocks do not receive grass tint
  assert.equal(shouldApplyGrassTint("stone", 2), false);
  assert.equal(shouldApplyGrassTint("dirt", 2), false);
  assert.equal(shouldApplyGrassTint(null), false);
});

test("shouldCompositeSideOverlay respects overlay presence and toggle without isExternal requirement", () => {
  assert.equal(shouldCompositeSideOverlay("grass_block", "textures/overlay.png", true), true);
  assert.equal(shouldCompositeSideOverlay("grass_block", true, true), true);

  // When overlay is false or missing
  assert.equal(shouldCompositeSideOverlay("grass_block", null, true), false);
  assert.equal(shouldCompositeSideOverlay("grass_block", "", true), false);

  // When showOverlays is toggled off
  assert.equal(shouldCompositeSideOverlay("grass_block", "textures/overlay.png", false), false);

  // Non-grass blocks do not composite grass overlay
  assert.equal(shouldCompositeSideOverlay("dirt", "textures/overlay.png", true), false);
});

test("tintGrayscaleBuffer accurately scales RGB channels by tint multipliers", () => {
  // 2 pixels: pixel 0 is 50% gray (128, 128, 128, 255), pixel 1 is transparent (128, 128, 128, 0)
  const buffer = new Uint8Array([128, 128, 128, 255, 128, 128, 128, 0]);
  const tint = [0.5, 0.75, 1.0];

  tintGrayscaleBuffer(buffer, tint);

  // Pixel 0
  assert.equal(buffer[0], Math.round(128 * 0.5));
  assert.equal(buffer[1], Math.round(128 * 0.75));
  assert.equal(buffer[2], Math.round(128 * 1.0));
  assert.equal(buffer[3], 255);

  // Pixel 1: transparent pixel unchanged
  assert.equal(buffer[4], 128);
  assert.equal(buffer[5], 128);
  assert.equal(buffer[6], 128);
  assert.equal(buffer[7], 0);
});

test("compositeGrassSideBuffers blends tinted overlay on top of base dirt buffer", () => {
  // 1x2 image:
  // Pixel 0: Dirt is brown (134, 96, 67, 255), Overlay is fully opaque white (255, 255, 255, 255)
  // Pixel 1: Dirt is brown (134, 96, 67, 255), Overlay is fully transparent (0, 0, 0, 0)
  const dirt = new Uint8Array([134, 96, 67, 255, 134, 96, 67, 255]);
  const overlay = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]);
  const tint = [145 / 255, 189 / 255, 89 / 255]; // Plains grass tint

  const composited = compositeGrassSideBuffers(dirt, overlay, tint, 2, 1);

  // Pixel 0: fully covered by tinted overlay
  assert.equal(composited[0], 145);
  assert.equal(composited[1], 189);
  assert.equal(composited[2], 89);
  assert.equal(composited[3], 255);

  // Pixel 1: overlay is transparent, dirt survives untouched
  assert.equal(composited[4], 134);
  assert.equal(composited[5], 96);
  assert.equal(composited[6], 67);
  assert.equal(composited[7], 255);
});

test("BiomeSelectorUI manages biome selection state and callbacks", () => {
  let changedBiome = null;
  let changedRgb = null;

  const ui = new BiomeSelectorUI({
    initialBiome: "plains",
    onBiomeChange: (biomeId, rgb) => {
      changedBiome = biomeId;
      changedRgb = rgb;
    }
  });

  assert.equal(ui.currentBiome, "plains");

  ui.setBiome("badlands");
  assert.equal(ui.currentBiome, "badlands");
  assert.equal(changedBiome, "badlands");
  assert.ok(Array.isArray(changedRgb) && changedRgb.length === 3);
  assert.equal(changedRgb[0].toFixed(3), (144 / 255).toFixed(3));
});
