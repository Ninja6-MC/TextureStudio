import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  hexToRgb,
  rgbToHex,
  calculateColormapCoordinates,
  normalizeBiomeId,
  getBiomeData,
  registerColormap,
  getColormapPixel,
  getBiomeTint,
  BIOMES,
  BIOME_OVERRIDES
} from "../../src/modules/biome-engine.js";

test("clamp correctly constrains values between min and max", () => {
  assert.equal(clamp(0.5, 0.0, 1.0), 0.5);
  assert.equal(clamp(-0.5, 0.0, 1.0), 0.0);
  assert.equal(clamp(1.5, 0.0, 1.0), 1.0);
  assert.equal(clamp(NaN, 0.0, 1.0), 0.0);
  assert.equal(clamp(undefined, 0.0, 1.0), 0.0);
});

test("hexToRgb converts 6-character hex strings into normalized RGB floats", () => {
  const badlandsGrass = hexToRgb("#90814d");
  assert.equal(badlandsGrass[0].toFixed(4), (144 / 255).toFixed(4));
  assert.equal(badlandsGrass[1].toFixed(4), (129 / 255).toFixed(4));
  assert.equal(badlandsGrass[2].toFixed(4), (77 / 255).toFixed(4));

  const white = hexToRgb("ffffff");
  assert.deepEqual(white, [1.0, 1.0, 1.0]);

  const invalid = hexToRgb("invalid");
  assert.deepEqual(invalid, [1.0, 1.0, 1.0]);
});

test("rgbToHex serializes normalized RGB components to valid hex color string", () => {
  assert.equal(rgbToHex(144 / 255, 129 / 255, 77 / 255), "#90814d");
  assert.equal(rgbToHex(158 / 255, 129 / 255, 77 / 255), "#9e814d");
  assert.equal(rgbToHex(106 / 255, 112 / 255, 57 / 255), "#6a7039");
  assert.equal(rgbToHex(1, 1, 1), "#ffffff");
  assert.equal(rgbToHex(0, 0, 0), "#000000");
});

test("calculateColormapCoordinates calculates authentic Minecraft UV and pixel coordinates", () => {
  // Plains: T = 0.8, H = 0.4
  // T_c = 0.8, H_c = 0.4 * 0.8 = 0.32
  // u = 1.0 - 0.8 = 0.2
  // v = 1.0 - 0.32 = 0.68
  // x = floor(0.2 * 255) = 51
  // y = floor(0.68 * 255) = 173
  const plainsCoords = calculateColormapCoordinates(0.8, 0.4);
  assert.equal(plainsCoords.temperature.toFixed(2), "0.80");
  assert.equal(plainsCoords.humidity.toFixed(2), "0.32");
  assert.equal(plainsCoords.u.toFixed(2), "0.20");
  assert.equal(plainsCoords.v.toFixed(2), "0.68");
  assert.equal(plainsCoords.x, 51);
  assert.equal(plainsCoords.y, 173);

  // Extremes: hot and arid (Desert / Badlands: T = 2.0 -> clamped to 1.0, H = 0.0)
  // T_c = 1.0, H_c = 0.0 * 1.0 = 0.0
  // u = 0.0, v = 1.0
  // x = 0, y = 255
  const hotArid = calculateColormapCoordinates(2.0, 0.0);
  assert.equal(hotArid.temperature, 1.0);
  assert.equal(hotArid.humidity, 0.0);
  assert.equal(hotArid.u, 0.0);
  assert.equal(hotArid.v, 1.0);
  assert.equal(hotArid.x, 0);
  assert.equal(hotArid.y, 255);

  // Extremes: sub-zero cold (Snowy Plains: T = -0.5 -> clamped to 0.0, H = 0.5)
  // T_c = 0.0, H_c = 0.5 * 0.0 = 0.0
  // u = 1.0, v = 1.0
  // x = 255, y = 255
  const snowy = calculateColormapCoordinates(-0.5, 0.5);
  assert.equal(snowy.temperature, 0.0);
  assert.equal(snowy.humidity, 0.0);
  assert.equal(snowy.u, 1.0);
  assert.equal(snowy.v, 1.0);
  assert.equal(snowy.x, 255);
  assert.equal(snowy.y, 255);
});

test("normalizeBiomeId handles namespaces, casing, and whitespace", () => {
  assert.equal(normalizeBiomeId("minecraft:plains"), "plains");
  assert.equal(normalizeBiomeId("  MINECRAFT:BADLANDS  "), "badlands");
  assert.equal(normalizeBiomeId("Forest"), "forest");
  assert.equal(normalizeBiomeId(null), "plains");
});

test("getBiomeData returns climate parameters and override status", () => {
  const plains = getBiomeData("plains");
  assert.equal(plains.id, "plains");
  assert.equal(plains.temperature, 0.8);
  assert.equal(plains.humidity, 0.4);
  assert.equal(plains.hasOverride, false);

  const badlands = getBiomeData("badlands");
  assert.equal(badlands.hasOverride, true);
  assert.equal(badlands.overrides.grass, "#90814d");
  assert.equal(badlands.overrides.foliage, "#9e814d");

  const swamp = getBiomeData("swamp");
  assert.equal(swamp.hasOverride, true);
  assert.equal(swamp.overrides.grass, "#6a7039");
  assert.equal(swamp.overrides.foliage, "#6a7039");
});

test("BIOME_OVERRIDES enforces exact Minecraft Java hardcoded hex values", () => {
  assert.equal(BIOME_OVERRIDES.badlands.grass, "#90814d");
  assert.equal(BIOME_OVERRIDES.badlands.foliage, "#9e814d");
  assert.equal(BIOME_OVERRIDES.mesa.grass, "#90814d");
  assert.equal(BIOME_OVERRIDES.mesa.foliage, "#9e814d");

  assert.equal(BIOME_OVERRIDES.swamp.grass, "#6a7039");
  assert.equal(BIOME_OVERRIDES.swamp.foliage, "#6a7039");
  assert.equal(BIOME_OVERRIDES.swampland.grass, "#6a7039");
  assert.equal(BIOME_OVERRIDES.swampland.foliage, "#6a7039");
});

test("getBiomeTint applies hardcoded overrides for Badlands / Mesa", () => {
  const badlandsGrass = getBiomeTint("badlands", "grass");
  assert.equal(rgbToHex(...badlandsGrass), "#90814d");

  const badlandsFoliage = getBiomeTint("badlands", "foliage");
  assert.equal(rgbToHex(...badlandsFoliage), "#9e814d");

  const mesaGrass = getBiomeTint("mesa", "grass");
  assert.equal(rgbToHex(...mesaGrass), "#90814d");

  const mesaFoliage = getBiomeTint("mesa", "foliage");
  assert.equal(rgbToHex(...mesaFoliage), "#9e814d");
});

test("getBiomeTint applies hardcoded overrides for Swamp biomes", () => {
  const swampGrass = getBiomeTint("swamp", "grass");
  assert.equal(rgbToHex(...swampGrass), "#6a7039");

  const swampFoliage = getBiomeTint("swamp", "foliage");
  assert.equal(rgbToHex(...swampFoliage), "#6a7039");

  const swamplandGrass = getBiomeTint("swampland", "grass");
  assert.equal(rgbToHex(...swamplandGrass), "#6a7039");
});

test("getBiomeTint samples authentic colormap colors for standard biomes", () => {
  // Plains
  const plainsGrass = getBiomeTint("plains", "grass");
  assert.equal(rgbToHex(...plainsGrass), "#91bd59");
  const plainsFoliage = getBiomeTint("plains", "foliage");
  assert.equal(rgbToHex(...plainsFoliage), "#77ab2f");

  // Forest
  const forestGrass = getBiomeTint("forest", "grass");
  assert.equal(rgbToHex(...forestGrass), "#79c05a");
  const forestFoliage = getBiomeTint("forest", "foliage");
  assert.equal(rgbToHex(...forestFoliage), "#59ae30");

  // Birch Forest
  const birchFoliage = getBiomeTint("birch_forest", "foliage");
  assert.equal(rgbToHex(...birchFoliage), "#6ba941");

  // Taiga
  const taigaGrass = getBiomeTint("taiga", "grass");
  assert.equal(rgbToHex(...taigaGrass), "#86b783");
  const taigaFoliage = getBiomeTint("taiga", "foliage");
  assert.equal(rgbToHex(...taigaFoliage), "#68a464");

  // Desert
  const desertGrass = getBiomeTint("desert", "grass");
  assert.equal(rgbToHex(...desertGrass), "#bfb755");
  const desertFoliage = getBiomeTint("desert", "foliage");
  assert.equal(rgbToHex(...desertFoliage), "#aea42a");

  // Jungle
  const jungleFoliage = getBiomeTint("jungle", "foliage");
  assert.equal(rgbToHex(...jungleFoliage), "#30bb0b");
});

test("getBiomeTint accepts climate object as direct input", () => {
  // Pass custom climate (T = 0.8, H = 0.4 -> Plains)
  const tint = getBiomeTint({ temperature: 0.8, humidity: 0.4 }, "grass");
  assert.equal(rgbToHex(...tint), "#91bd59");
});

test("getBiomeTint handles missing, unrecognized, and default parameters gracefully", () => {
  const defaultTint = getBiomeTint("unknown_biome_xyz");
  assert.equal(rgbToHex(...defaultTint), "#91bd59");

  const omittedCategory = getBiomeTint("plains");
  assert.equal(rgbToHex(...omittedCategory), "#91bd59");
});

test("registerColormap and getColormapPixel allow dynamic custom colormap ingestion", () => {
  const customBuffer = new Uint8Array(256 * 256 * 4);
  // Fill index for x = 10, y = 20 with red: (20 * 256 + 10) * 4
  const idx = (20 * 256 + 10) * 4;
  customBuffer[idx] = 255;
  customBuffer[idx + 1] = 128;
  customBuffer[idx + 2] = 64;
  customBuffer[idx + 3] = 255;

  registerColormap("custom_grass", customBuffer);
  const sampled = getColormapPixel("custom_grass", 10, 20);
  assert.equal(sampled[0], 1.0);
  assert.equal(sampled[1], 128 / 255);
  assert.equal(sampled[2], 64 / 255);
});
