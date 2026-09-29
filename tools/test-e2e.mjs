import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
  preloadStandardColormaps,
  getBiomeTint,
  rgbToHex,
  hexToRgb,
  BIOME_OVERRIDES,
  BIOMES
} from "../src/modules/biome-engine.js";

import {
  getBlockTintCategory,
  shouldApplyGrassTint,
  shouldApplyFoliageTint,
  shouldCompositeSideOverlay,
  tintGrayscaleBuffer,
  compositeGrassSideBuffers,
  BIOME_PRESETS
} from "../src/modules/biome-ui.js";

import {
  COLOR_SPACES,
  getColorSpaceForRole,
  configureTextureColorSpace
} from "../src/modules/color-space.js";

import {
  unpackLabPBRNormal,
  unpackLabPBRSpecular,
  createLabPBRMaterial,
  applyLabPBRShader,
  isConductor,
  F0_CONDUCTOR_THRESHOLD,
  F0_CONDUCTOR_BYTE_THRESHOLD
} from "../src/modules/pbr-material.js";

import {
  isPlantOrCrossBlock,
  isSolidBlock,
  createCrossQuadGeometry,
  cullMultiblockFaces,
  buildCulledMultiblockGeometry,
  CROSS_PLANT_BLOCK_IDS
} from "../src/modules/block-culling.js";

import {
  LiveSyncClient,
  createLiveSyncClient,
  attachLiveSync,
  invalidateTextureCache
} from "../src/modules/live-sync.js";

import {
  LIGHTING_PRESETS,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_TONE_MAPPING,
  DEFAULT_TONE_MAPPING_EXPOSURE,
  configureToneMapping,
  createLightingRig
} from "../src/modules/lighting-presets.js";

/**
 * Deterministic Mock EventSource for client-side SSE verification in Node.js.
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
    this.dispatchEvent({ type: "open" });
  }

  simulateError(err = new Error("Connection failed")) {
    this.readyState = 2; // CLOSED
    if (typeof this.onerror === "function") {
      this.onerror(err);
    }
    this.dispatchEvent({ type: "error", error: err });
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

// Verification state tracker for suite summary reporting
const verificationResults = {
  req1_grassBiomeTintMatch: false,
  req2_labPbrColorSpaceIntegrity: false,
  req3_crossQuadMultiblockCulling: false,
  req4_liveSyncTouchReload: false,
  req5_studioInspectionLightingToneMapping: false
};

const EPSILON = 1e-4;

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message || "Value mismatch"}: expected ${expected}, got ${actual}`
  );
}

// Preload standard vanilla colormaps
await preloadStandardColormaps();

// ============================================================================
// REQUIREMENT 1: Grass Block Top and Side Overhang Match Across 7 Biomes
// ============================================================================
test("Requirement 1: Grass block top and side overhang match across all 7 canonical biomes", () => {
  const canonicalBiomes = [
    "plains",
    "forest",
    "birch_forest",
    "dark_forest",
    "taiga",
    "swamp",
    "badlands"
  ];

  // Additional diverse climate biomes
  const additionalBiomes = ["savanna", "jungle", "desert", "snowy_plains"];
  const allTestedBiomes = [...canonicalBiomes, ...additionalBiomes];

  // 1. Assert tinting and overlay predicate rules
  assert.equal(getBlockTintCategory("grass_block"), "grass", "grass_block category must be grass");
  assert.equal(getBlockTintCategory("short_grass"), "grass", "short_grass category must be grass");
  assert.equal(getBlockTintCategory("fern"), "grass", "fern category must be grass");
  assert.equal(getBlockTintCategory("oak_leaves"), "foliage", "oak_leaves category must be foliage");
  assert.equal(getBlockTintCategory("jungle_leaves"), "foliage", "jungle_leaves category must be foliage");
  assert.equal(getBlockTintCategory("vine"), "foliage", "vine category must be foliage");
  assert.equal(getBlockTintCategory("stone"), null, "stone category must be null");

  for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
    assert.equal(
      shouldApplyFoliageTint("oak_leaves", faceIdx),
      true,
      `Oak leaves face index ${faceIdx} must receive foliage tint`
    );
    assert.equal(
      shouldApplyFoliageTint("jungle_leaves", faceIdx),
      true,
      `Jungle leaves face index ${faceIdx} must receive foliage tint`
    );
  }
  assert.equal(
    shouldApplyFoliageTint("oak_leaves"),
    true,
    "Oak leaves default face must receive foliage tint"
  );
  assert.equal(
    shouldApplyFoliageTint("grass_block", 2),
    false,
    "Grass block must not receive foliage tint"
  );
  assert.equal(
    shouldApplyFoliageTint("stone", 2),
    false,
    "Stone must not receive foliage tint"
  );

  assert.equal(
    shouldApplyGrassTint("grass_block", 2),
    true,
    "Grass block top face (+Y index 2) must receive grass tinting"
  );
  assert.equal(
    shouldApplyGrassTint("grass_block"),
    true,
    "Grass block default face must receive grass tinting"
  );
  assert.equal(
    shouldApplyGrassTint("grass_block", 0),
    false,
    "Grass block bottom face (-Y index 0) must not receive direct grass tinting"
  );
  assert.equal(
    shouldApplyGrassTint("dirt", 2),
    false,
    "Dirt top face must not receive grass tinting"
  );
  assert.equal(
    shouldCompositeSideOverlay("grass_block", true, true),
    true,
    "Grass block with overlay enabled must composite side overlay"
  );
  assert.equal(
    shouldCompositeSideOverlay("grass_block", "textures/grass_block_side_overlay.svg", true),
    true,
    "Grass block with overlay path must composite side overlay"
  );
  assert.equal(
    shouldCompositeSideOverlay("grass_block", true, false),
    false,
    "Disabled showOverlays toggle must suppress side overlay composite"
  );
  assert.equal(
    shouldCompositeSideOverlay("dirt", true, true),
    false,
    "Non-grass block must never composite side overlay"
  );

  // 2. Test each biome for exact top face tint vs side overhang composite match
  for (const biomeId of allTestedBiomes) {
    const tint = getBiomeTint(biomeId, "grass");

    // Validate normalized float array
    assert.ok(Array.isArray(tint) && tint.length === 3, `Biome ${biomeId} tint must be [r, g, b] array`);
    assert.ok(tint[0] >= 0 && tint[0] <= 1, `Biome ${biomeId} red out of bounds: ${tint[0]}`);
    assert.ok(tint[1] >= 0 && tint[1] <= 1, `Biome ${biomeId} green out of bounds: ${tint[1]}`);
    assert.ok(tint[2] >= 0 && tint[2] <= 1, `Biome ${biomeId} blue out of bounds: ${tint[2]}`);

    // Verify known hardcoded overrides
    if (biomeId === "badlands") {
      assert.equal(rgbToHex(...tint), "#90814d", "Badlands grass tint must match Java override #90814d");
    }
    if (biomeId === "swamp") {
      assert.equal(rgbToHex(...tint), "#6a7039", "Swamp grass tint must match Java override #6a7039");
    }
    if (biomeId === "plains") {
      assert.equal(rgbToHex(...tint), "#91bd59", "Plains grass tint must sample #91bd59");
    }

    // Verify foliage tinting across biomes from foliage.png and overrides
    const foliageTint = getBiomeTint(biomeId, "foliage");
    assert.ok(Array.isArray(foliageTint) && foliageTint.length === 3, `Biome ${biomeId} foliage tint must be [r, g, b] array`);
    assert.ok(foliageTint[0] >= 0 && foliageTint[0] <= 1, `Biome ${biomeId} foliage red out of bounds`);
    assert.ok(foliageTint[1] >= 0 && foliageTint[1] <= 1, `Biome ${biomeId} foliage green out of bounds`);
    assert.ok(foliageTint[2] >= 0 && foliageTint[2] <= 1, `Biome ${biomeId} foliage blue out of bounds`);

    if (biomeId === "badlands") {
      assert.equal(rgbToHex(...foliageTint), "#9e814d", "Badlands foliage tint must match Java override #9e814d");
    }
    if (biomeId === "swamp") {
      assert.equal(rgbToHex(...foliageTint), "#6a7039", "Swamp foliage tint must match Java override #6a7039");
    }
    if (biomeId === "plains") {
      assert.equal(rgbToHex(...foliageTint), "#77ab2f", "Plains foliage tint must sample #77ab2f");
    }
    if (biomeId === "forest") {
      assert.equal(rgbToHex(...foliageTint), "#59ae30", "Forest foliage tint must sample #59ae30");
    }
    if (biomeId === "jungle") {
      assert.equal(rgbToHex(...foliageTint), "#30bb0b", "Jungle foliage tint must sample #30bb0b");
    }

    // 3. Construct 4x4 top face grayscale buffer and side buffers
    // Grayscale top texture with varying luminance: highlight (255), midtone (180), shadow (100)
    const width = 4;
    const height = 4;
    const pixelCount = width * height;

    const topBuffer = new Uint8Array(pixelCount * 4);
    const dirtBuffer = new Uint8Array(pixelCount * 4);
    const overlayBuffer = new Uint8Array(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const pIdx = i * 4;
      const grayVal = (i % 3 === 0) ? 255 : (i % 3 === 1) ? 180 : 100;

      // Top face grayscale texture (alpha = 255)
      topBuffer[pIdx] = grayVal;
      topBuffer[pIdx + 1] = grayVal;
      topBuffer[pIdx + 2] = grayVal;
      topBuffer[pIdx + 3] = 255;

      // Dirt base buffer (brown: RGB [134, 96, 67, 255])
      dirtBuffer[pIdx] = 134;
      dirtBuffer[pIdx + 1] = 96;
      dirtBuffer[pIdx + 2] = 67;
      dirtBuffer[pIdx + 3] = 255;

      // Side overlay buffer:
      // Row 0 (i < 4): grass overhang fringe (alpha = 255, matching top grayscale)
      // Rows 1-3 (i >= 4): transparent area where dirt base is visible (alpha = 0)
      if (i < 4) {
        overlayBuffer[pIdx] = grayVal;
        overlayBuffer[pIdx + 1] = grayVal;
        overlayBuffer[pIdx + 2] = grayVal;
        overlayBuffer[pIdx + 3] = 255;
      } else {
        overlayBuffer[pIdx] = 0;
        overlayBuffer[pIdx + 1] = 0;
        overlayBuffer[pIdx + 2] = 0;
        overlayBuffer[pIdx + 3] = 0;
      }
    }

    // 4. Apply top face tinting (harmonized linear pipeline)
    tintGrayscaleBuffer(topBuffer, tint, { linear: true });

    // 5. Composite side overlay onto dirt base
    const compositedSide = compositeGrassSideBuffers(dirtBuffer, overlayBuffer, tint, width, height);

    // 6. Assert overhang fringe pixels match top face tinted pixels with zero color divergence
    for (let i = 0; i < 4; i++) {
      const pIdx = i * 4;
      assert.equal(
        compositedSide[pIdx],
        topBuffer[pIdx],
        `Biome ${biomeId} pixel ${i} Red divergence: composited side overhang vs top face`
      );
      assert.equal(
        compositedSide[pIdx + 1],
        topBuffer[pIdx + 1],
        `Biome ${biomeId} pixel ${i} Green divergence: composited side overhang vs top face`
      );
      assert.equal(
        compositedSide[pIdx + 2],
        topBuffer[pIdx + 2],
        `Biome ${biomeId} pixel ${i} Blue divergence: composited side overhang vs top face`
      );
      assert.equal(
        compositedSide[pIdx + 3],
        255,
        `Biome ${biomeId} pixel ${i} Alpha divergence: overhang must be opaque`
      );
    }

    // 7. Assert dirt area pixels retain unaffected base dirt colors
    for (let i = 4; i < pixelCount; i++) {
      const pIdx = i * 4;
      assert.equal(compositedSide[pIdx], 134, `Dirt Red channel modified on pixel ${i}`);
      assert.equal(compositedSide[pIdx + 1], 96, `Dirt Green channel modified on pixel ${i}`);
      assert.equal(compositedSide[pIdx + 2], 67, `Dirt Blue channel modified on pixel ${i}`);
      assert.equal(compositedSide[pIdx + 3], 255, `Dirt Alpha channel modified on pixel ${i}`);
    }
  }

  verificationResults.req1_grassBiomeTintMatch = true;
});

// ============================================================================
// REQUIREMENT 2: LabPBR Normals, AO, Roughness, Metalness & Color Space
// ============================================================================
test("Requirement 2: LabPBR normals, AO, roughness, and metalness render authentically without gamma distortion", () => {
  // 1. Verify color space resolution and assignments
  assert.equal(COLOR_SPACES.SRGB, "srgb");
  assert.equal(COLOR_SPACES.NO_COLOR, "");
  assert.equal(getColorSpaceForRole("albedo"), "srgb");
  assert.equal(getColorSpaceForRole("diffuse"), "srgb");
  assert.equal(getColorSpaceForRole("normal"), "");
  assert.equal(getColorSpaceForRole("pbr_data"), "");
  assert.equal(getColorSpaceForRole("specular"), "");
  assert.equal(getColorSpaceForRole("roughness"), "");

  const albedoTex = { colorSpace: null };
  const normalTex = { colorSpace: "srgb" };
  const specularTex = { colorSpace: "srgb" };
  const pbrDataTex = { colorSpace: "srgb" };

  configureTextureColorSpace(albedoTex, "albedo");
  configureTextureColorSpace(normalTex, "normal");
  configureTextureColorSpace(specularTex, "specular");
  configureTextureColorSpace(pbrDataTex, "pbr_data");

  assert.equal(albedoTex.colorSpace, "srgb", "Albedo map must use sRGB color space");
  assert.equal(normalTex.colorSpace, "", "Normal map must use NoColorSpace to avoid gamma distortion");
  assert.equal(specularTex.colorSpace, "", "Specular map must use NoColorSpace to avoid gamma distortion");
  assert.equal(pbrDataTex.colorSpace, "", "PBR data map must use NoColorSpace to avoid gamma distortion");

  // 2. Verify data integrity against gamma curve distortion
  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // A neutral normal tangent vector (0.0) is encoded as 128/255 in the texture
  const neutralNormalByte = 128 / 255;
  const decodedUnderSrgb = srgbToLinear(neutralNormalByte);
  const decodedUnderNoColor = neutralNormalByte;

  // sRGB gamma correction distorts neutral normal from ~0.502 down to ~0.214 (a 28.5 degree error)
  assert.notEqual(
    decodedUnderSrgb.toFixed(3),
    decodedUnderNoColor.toFixed(3),
    "sRGB curve must corrupt linear tangent normal data"
  );
  assert.equal(
    decodedUnderNoColor.toFixed(3),
    "0.502",
    "NoColorSpace preserves raw linear normal encoding"
  );

  // Conductor threshold: F0 = 230/255 (~0.902). Under sRGB curve, it drops to ~0.791 (< 0.9),
  // which would incorrectly categorize conductor metals (gold, copper, iron) as dielectrics.
  const f0Threshold = 230 / 255;
  const f0UnderSrgb = srgbToLinear(f0Threshold);
  assert.ok(
    f0UnderSrgb < 0.85,
    "sRGB gamma curve shifts conductor threshold down, distorting metalness classification"
  );

  // 3. Verify unpackLabPBRNormal channel unpacking and DirectX Y- to OpenGL Y+ flip
  // Flat surface normal in DirectX: [128, 128, 255, 255]
  const flatNormal = unpackLabPBRNormal(128, 128, 255, 255);
  assertClose(flatNormal.normalX, 128 / 255, "Normal X extraction");
  assertClose(flatNormal.normalY, 1.0 - (128 / 255), "DirectX Y- flip to OpenGL Y+");
  assertClose(flatNormal.ao, 1.0, "AO extraction");
  assertClose(flatNormal.height, 1.0, "POM height extraction");
  assertClose(flatNormal.normalVector.z, 1.0, "Flat tangent normal points outward along +Z");

  // Sloped surface: DirectX G = 0.2 (downward in DirectX screen space)
  // In OpenGL, 1.0 - 0.2 = 0.8 (upward in OpenGL tangent space)
  const slopedNormal = unpackLabPBRNormal(0.5, 0.2, 0.8, 0.6);
  assertClose(slopedNormal.normalX, 0.5, "Sloped Normal X");
  assertClose(slopedNormal.normalY, 0.8, "DirectX 0.2 flipped to OpenGL 0.8");
  assertClose(slopedNormal.ao, 0.8, "AO channel");
  assertClose(slopedNormal.height, 0.6, "Height channel");
  assert.ok(slopedNormal.normalVector.y > 0.5, "OpenGL Y normal vector points upward");

  // 4. Verify unpackLabPBRSpecular smoothness inversion, metalness threshold, and emission
  // Dielectric material (F0 = 229 / 255)
  const dielectricSpec = unpackLabPBRSpecular(200, 229, 30, 100);
  assertClose(dielectricSpec.roughness, 1.0 - (200 / 255), "Roughness = 1.0 - Smoothness");
  assert.equal(dielectricSpec.isConductor, false, "F0 229 must be dielectric");
  assert.equal(dielectricSpec.metalness, 0.0, "Dielectric metalness must be 0.0");
  assertClose(dielectricSpec.emission, 100 / 255, "Emission extraction");

  // Conductor material (F0 = 230 / 255)
  const conductorSpec = unpackLabPBRSpecular(255, 230, 0, 0);
  assertClose(conductorSpec.roughness, 0.0, "Full smoothness produces zero roughness");
  assert.equal(conductorSpec.isConductor, true, "F0 230 must be conductor");
  assert.equal(conductorSpec.metalness, 1.0, "Conductor metalness must be 1.0");

  // Float range conductor verification
  assert.equal(isConductor(0.89), false);
  assert.equal(isConductor(0.902), true);
  assert.equal(isConductor(230), true);
  assert.equal(isConductor(255), true);

  // 5. Verify createLabPBRMaterial applies color spaces and injects LabPBR shader uniforms
  const mockAlbedo = { colorSpace: null };
  const mockNormal = { colorSpace: "srgb" };
  const mockSpecular = { colorSpace: "srgb" };

  const material = createLabPBRMaterial({
    albedoMap: mockAlbedo,
    normalMap: mockNormal,
    specularMap: mockSpecular,
    aoIntensity: 0.9,
    emissiveIntensity: 1.5,
    THREE
  });

  assert.ok(material instanceof THREE.MeshStandardMaterial);
  assert.equal(mockAlbedo.colorSpace, "srgb", "createLabPBRMaterial sets albedo to srgb");
  assert.equal(mockNormal.colorSpace, "", "createLabPBRMaterial sets normal to NoColorSpace");
  assert.equal(mockSpecular.colorSpace, "", "createLabPBRMaterial sets specular to NoColorSpace");

  assert.equal(material.userData.isLabPBR, true);
  assert.equal(material.userData.aoIntensity, 0.9);
  assert.equal(material.userData.emissiveIntensity, 1.5);
  assert.equal(material.defines.USE_LABPBR_NORMAL, "1");
  assert.equal(material.defines.USE_LABPBR_SPECULAR, "1");

  // Test shader compilation hook injection
  const dummyShader = {
    uniforms: {},
    fragmentShader: `
      #include <roughnessmap_pars_fragment>
      #include <normal_fragment_maps>
      #include <roughnessmap_fragment>
      #include <metalnessmap_fragment>
      #include <emissivemap_fragment>
      #include <aomap_fragment>
    `
  };

  assert.equal(typeof material.onBeforeCompile, "function");
  material.onBeforeCompile(dummyShader);

  // Verify custom uniforms injected
  assert.ok("specularMap" in dummyShader.uniforms, "specularMap uniform injected");
  assert.ok("labpbrAoIntensity" in dummyShader.uniforms, "labpbrAoIntensity uniform injected");
  assert.ok("labpbrEmissiveIntensity" in dummyShader.uniforms, "labpbrEmissiveIntensity uniform injected");
  assert.equal(dummyShader.uniforms.labpbrAoIntensity.value, 0.9);
  assert.equal(dummyShader.uniforms.labpbrEmissiveIntensity.value, 1.5);

  // Verify fragment shader includes authentic LabPBR logic
  assert.ok(
    dummyShader.fragmentShader.includes("( 1.0 - labpbrNormalTex.g )"),
    "Fragment shader must include DirectX to OpenGL normal Y-flip"
  );
  assert.ok(
    dummyShader.fragmentShader.includes("( 1.0 - labpbrSpecularTex.r )"),
    "Fragment shader must include smoothness to roughness inversion"
  );
  assert.ok(
    dummyShader.fragmentShader.includes("step( 229.5 / 255.0, labpbrSpecularTex.g )"),
    "Fragment shader must include conductor metalness step threshold"
  );
  assert.ok(
    dummyShader.fragmentShader.includes("mix( 1.0, labpbrNormalTex.b, labpbrAoIntensity )"),
    "Fragment shader must modulate indirect diffuse light with LabPBR AO"
  );

  verificationResults.req2_labPbrColorSpaceIntegrity = true;
});

// ============================================================================
// REQUIREMENT 3: Cross-Quads Render Without Z-Fighting in Multiblock View
// ============================================================================
test("Requirement 3: Cross-quads render without z-fighting in multiblock view", () => {
  // 1. Verify isPlantOrCrossBlock identification
  const plantBlocks = [
    "short_grass",
    "tall_grass",
    "grass",
    "fern",
    "large_fern",
    "poppy",
    "dandelion",
    "blue_orchid",
    "allium",
    "azure_bluet",
    "red_tulip",
    "oxeye_daisy",
    "cornflower",
    "sunflower",
    "oak_sapling",
    "spruce_sapling",
    "birch_sapling",
    "cherry_sapling",
    "crimson_roots"
  ];

  for (const blockId of plantBlocks) {
    assert.equal(
      isPlantOrCrossBlock(blockId),
      true,
      `Plant block '${blockId}' must be recognized as plant/cross-block`
    );
  }

  // Non-plants must return false
  const solidBlocks = ["stone", "dirt", "grass_block", "oak_planks", "cobblestone", "glass", "air"];
  for (const blockId of solidBlocks) {
    assert.equal(
      isPlantOrCrossBlock(blockId),
      false,
      `Solid/structural block '${blockId}' must not be recognized as plant/cross-block`
    );
  }

  // 2. Verify createCrossQuadGeometry
  const crossGeoCentered = createCrossQuadGeometry({ center: true, THREE });
  assert.ok(crossGeoCentered instanceof THREE.BufferGeometry);

  const posAttr = crossGeoCentered.getAttribute("position");
  const normAttr = crossGeoCentered.getAttribute("normal");
  const uvAttr = crossGeoCentered.getAttribute("uv");
  const tanAttr = crossGeoCentered.getAttribute("tangent");

  // 2 diagonal intersecting quads * 6 vertices per quad = 12 vertices
  assert.equal(posAttr.count, 12, "Cross-quad geometry must have 12 vertices");
  assert.equal(normAttr.count, 12, "Cross-quad normals count");
  assert.equal(uvAttr.count, 12, "Cross-quad UVs count");
  assert.equal(tanAttr.count, 12, "Cross-quad tangents count");
  assert.equal(tanAttr.itemSize, 4, "Tangents must have 4 components [x, y, z, w]");

  // Verify centered bounds [-0.5, 0.5]^3
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    minX = Math.min(minX, posAttr.getX(i));
    maxX = Math.max(maxX, posAttr.getX(i));
    minY = Math.min(minY, posAttr.getY(i));
    maxY = Math.max(maxY, posAttr.getY(i));
    minZ = Math.min(minZ, posAttr.getZ(i));
    maxZ = Math.max(maxZ, posAttr.getZ(i));
  }

  assertClose(minX, -0.5, "Centered cross-quad minX");
  assertClose(maxX, 0.5, "Centered cross-quad maxX");
  assertClose(minY, -0.5, "Centered cross-quad minY");
  assertClose(maxY, 0.5, "Centered cross-quad maxY");
  assertClose(minZ, -0.5, "Centered cross-quad minZ");
  assertClose(maxZ, 0.5, "Centered cross-quad maxZ");

  // Double-sided geometry setup
  assert.equal(crossGeoCentered.userData.doubleSided, true);
  assert.equal(crossGeoCentered.userData.side, THREE.DoubleSide);

  // Geometric orthogonality of normals to diagonal planes
  // Quad 1 plane vector is along (1, 0, 1) -> normal dot (1, 0, 1) must be 0
  // Quad 2 plane vector is along (1, 0, -1) -> normal dot (1, 0, -1) must be 0
  for (let i = 0; i < 6; i++) {
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    assertClose(ny, 0.0, `Quad 1 normal ny at ${i}`);
    assertClose(nx + nz, 0.0, `Quad 1 normal must be orthogonal to (1, 0, 1) at ${i}`);

    // Gram-Schmidt Tangent orthogonality: dot(N, T) must be 0
    const tx = tanAttr.getX(i);
    const ty = tanAttr.getY(i);
    const tz = tanAttr.getZ(i);
    const dotNT = nx * tx + ny * ty + nz * tz;
    assertClose(dotNT, 0.0, `Quad 1 tangent must be orthogonal to normal at ${i}`);
  }

  for (let i = 6; i < 12; i++) {
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    assertClose(ny, 0.0, `Quad 2 normal ny at ${i}`);
    assertClose(nx - nz, 0.0, `Quad 2 normal must be orthogonal to (1, 0, -1) at ${i}`);

    const tx = tanAttr.getX(i);
    const ty = tanAttr.getY(i);
    const tz = tanAttr.getZ(i);
    const dotNT = nx * tx + ny * ty + nz * tz;
    assertClose(dotNT, 0.0, `Quad 2 tangent must be orthogonal to normal at ${i}`);
  }

  // 3. Verify multiblock culling on 3x3 platform (9 blocks)
  const platformBlocks = [];
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      platformBlocks.push({ id: "stone", x, y: 0, z });
    }
  }

  const platformCulling = cullMultiblockFaces(platformBlocks);
  // Total potential faces = 9 * 6 = 54
  // 12 touching pairs = 24 internal faces culled
  // 30 exterior faces retained (9 top, 9 bottom, 3 north, 3 south, 3 east, 3 west)
  assert.equal(platformCulling.totalCount, 54, "3x3 platform total faces");
  assert.equal(platformCulling.culledCount, 24, "3x3 platform internal culled faces");
  assert.equal(platformCulling.retainedCount, 30, "3x3 platform exterior retained faces");

  const centerBlock = platformCulling.blocks.find(
    (b) => b.position[0] === 1 && b.position[1] === 0 && b.position[2] === 1
  );
  assert.ok(centerBlock, "Center block exists");
  assert.equal(centerBlock.culledCount, 4, "Center block has all 4 horizontal faces culled");
  assert.equal(centerBlock.retainedCount, 2, "Center block retains only up and down");
  assert.deepEqual(centerBlock.retainedFaces.sort(), ["down", "up"]);

  // 4. Verify multiblock culling on 3x3 vertical wall (9 blocks)
  const wallBlocks = [];
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      wallBlocks.push({ id: "stone", x, y, z: 0 });
    }
  }

  const wallCulling = cullMultiblockFaces(wallBlocks);
  assert.equal(wallCulling.culledCount, 24, "3x3 wall culled internal faces");
  assert.equal(wallCulling.retainedCount, 30, "3x3 wall retained exterior faces");

  // 5. Verify multiblock culling with cross-quad plant: prevent z-fighting and seam bleeding
  const sceneWithPlant = [
    { id: "grass_block", x: 0, y: 0, z: 0 },
    { id: "short_grass", x: 0, y: 1, z: 0 }, // Plant resting on top of grass block
    { id: "dirt", x: 0, y: -1, z: 0 },        // Dirt below grass block
    { id: "stone", x: 1, y: 0, z: 0 }         // Solid neighbor to east
  ];

  const sceneCulling = cullMultiblockFaces(sceneWithPlant);
  const grassBlockReport = sceneCulling.blocks[0];
  const plantReport = sceneCulling.blocks[1];

  // The plant above grass block must NOT cull grass block top face (+Y)
  assert.ok(
    grassBlockReport.retainedFaces.includes("up"),
    "Grass block top face must remain intact when plant sits on it"
  );
  // The dirt block below grass block DOES cull bottom face (-Y)
  assert.ok(
    grassBlockReport.culledFaces.includes("down"),
    "Grass block bottom face is culled by solid dirt below"
  );
  // The stone block east of grass block DOES cull east face (+X)
  assert.ok(
    grassBlockReport.culledFaces.includes("east"),
    "Grass block east face is culled by solid stone neighbor"
  );

  // Plant is recognized and never culled
  assert.equal(plantReport.isPlant, true, "Short grass flagged as plant");
  assert.equal(plantReport.culledCount, 0, "Plant has 0 culled faces");

  verificationResults.req3_crossQuadMultiblockCulling = true;
});

// ============================================================================
// REQUIREMENT 4: Live File Reload Triggers Seamlessly on SVG Touch
// ============================================================================
test("Requirement 4: Live file reload triggers seamlessly on SVG touch", () => {
  MockEventSource.instances = [];

  // 1. Verify invalidateTextureCache selective cache invalidation
  const cache = new Map([
    ["textures/grass_block_top.svg?t=1000_512", { id: "top" }],
    ["textures/dirt.svg?t=1000_512", { id: "dirt" }],
    ["comp_textures/grass_block_side.svg_textures/dirt.svg_512_1000", { id: "composite" }],
    ["textures/dirt_path.svg?t=1000_512", { id: "path" }],
    ["textures/stone.svg?t=1000_512", { id: "stone" }]
  ]);

  // Simulate touching dirt.svg at timestamp 2000
  const invalidationRes = invalidateTextureCache(cache, "dirt.svg", 2000);

  assert.equal(invalidationRes.invalidatedCount, 2, "Must invalidate exactly dirt.svg and its composite");
  assert.equal(invalidationRes.cacheBustTimestamp, 2000, "Cache bust timestamp must update to 2000");

  assert.equal(cache.has("textures/dirt.svg?t=1000_512"), false, "dirt.svg must be evicted");
  assert.equal(
    cache.has("comp_textures/grass_block_side.svg_textures/dirt.svg_512_1000"),
    false,
    "composite with dirt.svg must be evicted"
  );

  // Verify stem boundary: dirt_path.svg must not be falsely invalidated
  assert.equal(
    cache.has("textures/dirt_path.svg?t=1000_512"),
    true,
    "dirt_path.svg must be preserved across dirt.svg modification"
  );
  assert.equal(
    cache.has("textures/grass_block_top.svg?t=1000_512"),
    true,
    "grass_block_top.svg must be preserved"
  );
  assert.equal(
    cache.has("textures/stone.svg?t=1000_512"),
    true,
    "stone.svg must be preserved"
  );

  // Wildcard invalidation
  const wildcardRes = invalidateTextureCache(cache, "*", 3000);
  assert.equal(wildcardRes.invalidatedCount, 3, "Wildcard must clear remaining 3 entries");
  assert.equal(cache.size, 0, "Cache must be completely empty after wildcard invalidation");

  // 2. Verify attachLiveSync application integration and render trigger
  let renderCallCount = 0;
  const mockApp = {
    cacheBustTimestamp: 1000,
    textureCache: new Map([
      ["textures/grass_block_top.svg?t=1000_512", {}],
      ["textures/dirt.svg?t=1000_512", {}],
      ["textures/stone.svg?t=1000_512", {}]
    ]),
    render3DObjects() {
      renderCallCount++;
    }
  };

  let reloadCallbackPayload = null;
  const syncClient = attachLiveSync(mockApp, {
    EventSource: MockEventSource,
    partialInvalidation: true,
    timestamp: 4000,
    onReload: (data) => {
      reloadCallbackPayload = data;
    }
  });

  const mockEs = MockEventSource.instances[0];
  assert.ok(mockEs, "EventSource must be instantiated");

  // Simulate SSE stream open
  mockEs.simulateOpen();
  assert.equal(syncClient.status, "connected", "LiveSyncClient status must be 'connected'");

  // Simulate file touch event for grass_block_top.svg
  mockEs.simulateEvent("change", {
    filename: "grass_block_top.svg",
    stem: "grass_block_top"
  });

  // Verify app state updates
  assert.equal(mockApp.cacheBustTimestamp, 4000, "Application cacheBustTimestamp must update");
  assert.equal(
    mockApp.textureCache.has("textures/grass_block_top.svg?t=1000_512"),
    false,
    "Touched SVG texture must be removed from cache"
  );
  assert.equal(
    mockApp.textureCache.has("textures/dirt.svg?t=1000_512"),
    true,
    "Untouched dirt texture must remain cached"
  );
  assert.equal(
    mockApp.textureCache.has("textures/stone.svg?t=1000_512"),
    true,
    "Untouched stone texture must remain cached"
  );
  assert.equal(renderCallCount, 1, "render3DObjects must be triggered on file touch");
  assert.deepEqual(
    reloadCallbackPayload,
    { filename: "grass_block_top.svg", stem: "grass_block_top" },
    "onReload callback must receive exact change payload"
  );

  // 3. Verify clean error reconnection and disconnect lifecycle
  // Simulate network interruption
  mockEs.simulateError();
  assert.equal(syncClient.status, "error", "Status transitions to error on SSE disconnect");

  // Clean detach and close
  syncClient.detach();
  assert.equal(syncClient.status, "disconnected", "Client cleanly transitions to disconnected");

  verificationResults.req4_liveSyncTouchReload = true;
});

// ============================================================================
// REQUIREMENT 5: Studio Inspection Lighting Calibration & ACES Tone Mapping
// ============================================================================
test("Requirement 5: Studio inspection lighting and ACES tone mapping prevent color blowout", async () => {
  // 1. Default preset must be studio-neutral
  assert.equal(
    DEFAULT_LIGHTING_PRESET,
    "studio-neutral",
    "Default lighting preset must be studio-neutral for accurate inspection"
  );

  // 2. Studio Neutral preset inspection calibration
  const studioPreset = LIGHTING_PRESETS["studio-neutral"];
  assert.ok(studioPreset, "studio-neutral preset must exist");
  assert.equal(studioPreset.sun.hex, "#ffffff", "Studio Neutral key light must be pure neutral white");
  assert.equal(studioPreset.ambient.hex, "#ffffff", "Studio Neutral ambient light must be pure neutral white");
  assert.equal(studioPreset.fill.hex, "#ffffff", "Studio Neutral fill light must be pure neutral white");
  assert.equal(studioPreset.rim.hex, "#ffffff", "Studio Neutral rim light must be pure neutral white");

  // Verify balanced intensities across 3-point inspection rig (combined illumination <= 1.5)
  assertClose(studioPreset.sun.intensity, 1.0, "Key light intensity must be 1.0");
  assertClose(studioPreset.ambient.intensity, 0.4, "Ambient intensity must be 0.4");
  assertClose(studioPreset.fill.intensity, 0.3, "Fill intensity must be 0.3");
  assertClose(studioPreset.rim.intensity, 0.2, "Rim intensity must be 0.2");
  const studioTotal = studioPreset.sun.intensity + studioPreset.ambient.intensity;
  assert.ok(
    studioTotal <= 1.5,
    `Studio Neutral direct + ambient (${studioTotal}) must prevent highlight blowout (<= 1.5)`
  );

  // 3. Trailer Golden Hour calibrated intensities (softened to prevent color burnout)
  const goldenPreset = LIGHTING_PRESETS["trailer-golden-hour"];
  assert.ok(goldenPreset, "trailer-golden-hour preset must exist");
  assertClose(goldenPreset.sun.intensity, 1.2, "Golden Hour sun intensity must be calibrated to 1.2");
  assertClose(goldenPreset.ambient.intensity, 0.4, "Golden Hour ambient intensity must be calibrated to 0.4");
  const goldenTotal = goldenPreset.sun.intensity + goldenPreset.ambient.intensity;
  assert.ok(
    goldenTotal <= 1.7,
    `Trailer Golden Hour combined illumination (${goldenTotal}) must not exceed 1.7 (softened from 2.4)`
  );

  // 4. Tone mapping and exposure configuration on renderer
  const mockRenderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 0.5
  };
  configureToneMapping(mockRenderer);
  assert.equal(
    mockRenderer.toneMapping,
    THREE.ACESFilmicToneMapping,
    "Renderer must be configured with ACESFilmicToneMapping"
  );
  assertClose(
    mockRenderer.toneMappingExposure,
    1.0,
    "Renderer toneMappingExposure must be set to 1.0"
  );

  // 5. LightingRig initialization defaults to studio-neutral and auto-configures renderer
  const scene = new THREE.Scene();
  const rigRenderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 0.5
  };
  const rig = createLightingRig(scene, { renderer: rigRenderer });
  assert.equal(rig.currentPresetId, "studio-neutral", "LightingRig must default to studio-neutral");
  assert.equal(rigRenderer.toneMapping, THREE.ACESFilmicToneMapping, "Rig must configure tone mapping on renderer");
  assertClose(rigRenderer.toneMappingExposure, 1.0, "Rig must configure exposure 1.0 on renderer");

  // Verify pure neutral light colors applied to scene
  assert.equal(rig.sunLight.color.getHexString(), "ffffff");
  assert.equal(rig.ambientLight.color.getHexString(), "ffffff");
  assert.equal(rig.fillLight.color.getHexString(), "ffffff");
  assert.equal(rig.rimLight.color.getHexString(), "ffffff");
  rig.dispose();

  verificationResults.req5_studioInspectionLightingToneMapping = true;
});

// ============================================================================
// SUITE SUMMARY REPORTING
// ============================================================================
after(() => {
  const req1Status = verificationResults.req1_grassBiomeTintMatch ? "PASSED" : "FAILED";
  const req2Status = verificationResults.req2_labPbrColorSpaceIntegrity ? "PASSED" : "FAILED";
  const req3Status = verificationResults.req3_crossQuadMultiblockCulling ? "PASSED" : "FAILED";
  const req4Status = verificationResults.req4_liveSyncTouchReload ? "PASSED" : "FAILED";
  const req5Status = verificationResults.req5_studioInspectionLightingToneMapping ? "PASSED" : "FAILED";

  const allPassed =
    verificationResults.req1_grassBiomeTintMatch &&
    verificationResults.req2_labPbrColorSpaceIntegrity &&
    verificationResults.req3_crossQuadMultiblockCulling &&
    verificationResults.req4_liveSyncTouchReload &&
    verificationResults.req5_studioInspectionLightingToneMapping;

  console.log("\n================================================================================");
  console.log("             TEXTURESTUDIO END-TO-END VISUAL VERIFICATION SUITE                 ");
  console.log("================================================================================");
  console.log(`  [REQ 1] Grass Block Biome Tint & Side Overhang Composite (7 Biomes) : ${req1Status}`);
  console.log(`  [REQ 2] LabPBR Normals, Specular, AO & Color Space Integrity       : ${req2Status}`);
  console.log(`  [REQ 3] Cross-Quad Plant Geometry & Multiblock Culling (No Z-Fight): ${req3Status}`);
  console.log(`  [REQ 4] Live Sync SSE Invalidation & Cache-Bust Dispatch           : ${req4Status}`);
  console.log(`  [REQ 5] Studio Inspection Lighting Calibration & ACES Tone Mapping : ${req5Status}`);
  console.log("================================================================================");
  if (allPassed) {
    console.log("  OVERALL VERIFICATION VERDICT: ALL E2E REQUIREMENTS VERIFIED SUCCESSFULLY     ");
  } else {
    console.log("  OVERALL VERIFICATION VERDICT: VERIFICATION FAILURES DETECTED                ");
  }
  console.log("================================================================================\n");
});
