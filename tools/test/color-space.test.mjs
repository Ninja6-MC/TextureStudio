import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  COLOR_SPACES,
  getColorSpaceForRole,
  configureTextureColorSpace,
  srgbToLinear,
  linearToSrgb
} from "../../src/modules/color-space.js";
import { compositeGrassSideBuffers } from "../../src/modules/biome-ui.js";
import { getBiomeTint } from "../../src/modules/biome-engine.js";

test("COLOR_SPACES exposes expected standard color space values", () => {
  assert.equal(COLOR_SPACES.SRGB, "srgb");
  assert.equal(COLOR_SPACES.NO_COLOR, "");
  assert.equal(COLOR_SPACES.LINEAR_SRGB, "srgb-linear");
});

test("getColorSpaceForRole resolves color space for known roles", () => {
  assert.equal(getColorSpaceForRole("albedo"), "srgb");
  assert.equal(getColorSpaceForRole("diffuse"), "srgb");
  assert.equal(getColorSpaceForRole("normal"), "");
  assert.equal(getColorSpaceForRole("pbr_data"), "");
  assert.equal(getColorSpaceForRole("specular"), "");
  assert.equal(getColorSpaceForRole("roughness"), "");
});

test("configureTextureColorSpace sets sRGB color space for albedo and diffuse roles", () => {
  const albedoTexture = { colorSpace: null };
  const returnedAlbedo = configureTextureColorSpace(albedoTexture, "albedo");
  assert.strictEqual(returnedAlbedo, albedoTexture);
  assert.equal(albedoTexture.colorSpace, "srgb");

  const diffuseTexture = { colorSpace: null };
  const returnedDiffuse = configureTextureColorSpace(diffuseTexture, "diffuse");
  assert.strictEqual(returnedDiffuse, diffuseTexture);
  assert.equal(diffuseTexture.colorSpace, "srgb");
});

test("configureTextureColorSpace sets NoColorSpace ('') for normal, pbr_data, and specular roles", () => {
  const normalTexture = { colorSpace: "srgb" };
  const returnedNormal = configureTextureColorSpace(normalTexture, "normal");
  assert.strictEqual(returnedNormal, normalTexture);
  assert.equal(normalTexture.colorSpace, "");

  const pbrDataTexture = { colorSpace: "srgb" };
  const returnedPbrData = configureTextureColorSpace(pbrDataTexture, "pbr_data");
  assert.strictEqual(returnedPbrData, pbrDataTexture);
  assert.equal(pbrDataTexture.colorSpace, "");

  const specularTexture = { colorSpace: "srgb" };
  const returnedSpecular = configureTextureColorSpace(specularTexture, "specular");
  assert.strictEqual(returnedSpecular, specularTexture);
  assert.equal(specularTexture.colorSpace, "");
});

test("configureTextureColorSpace is case-insensitive and whitespace-tolerant", () => {
  const cases = [
    { role: "  ALBEDO  ", expected: "srgb" },
    { role: "Diffuse ", expected: "srgb" },
    { role: "\tNORMAL\t", expected: "" },
    { role: " PBR_DATA ", expected: "" },
    { role: " SpEcUlAr ", expected: "" }
  ];

  for (const { role, expected } of cases) {
    const tex = { colorSpace: undefined };
    configureTextureColorSpace(tex, role);
    assert.equal(tex.colorSpace, expected, `Failed for role: '${role}'`);
  }
});

test("configureTextureColorSpace handles null and undefined texture inputs gracefully", () => {
  assert.strictEqual(configureTextureColorSpace(null, "albedo"), null);
  assert.strictEqual(configureTextureColorSpace(undefined, "normal"), undefined);
});

test("configureTextureColorSpace preserves existing colorSpace for unrecognized roles", () => {
  const texture = { colorSpace: "custom-space" };
  const result = configureTextureColorSpace(texture, "unknown_role");
  assert.strictEqual(result, texture);
  assert.equal(texture.colorSpace, "custom-space");

  const nonStringResult = configureTextureColorSpace(texture, null);
  assert.strictEqual(nonStringResult, texture);
  assert.equal(texture.colorSpace, "custom-space");
});

test("data integrity: normal and roughness/specular maps avoid gamma curve correction", () => {
  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // Normal vector neutral center: 0.5 encoded in texture represents 0.0 in tangent normal space [-1, 1]
  const neutralEncoded = 128 / 255;
  const decodedUnderSrgb = srgbToLinear(neutralEncoded);
  const decodedUnderNoColor = neutralEncoded;

  // sRGB gamma correction significantly warps the scalar value (~0.214 vs ~0.502)
  assert.notEqual(decodedUnderSrgb.toFixed(3), decodedUnderNoColor.toFixed(3));

  // Verify that data roles explicitly receive NoColorSpace ('') to prevent this corruption
  const dataRoles = ["normal", "pbr_data", "pbr-data", "specular", "roughness"];
  for (const role of dataRoles) {
    const texture = { colorSpace: "srgb" };
    configureTextureColorSpace(texture, role);
    assert.equal(
      texture.colorSpace,
      COLOR_SPACES.NO_COLOR,
      `Data role '${role}' must use NoColorSpace to avoid gamma corruption`
    );
  }
});

test("srgbToLinear and linearToSrgb transfer functions match Three.js SRGBColorSpace transfer", () => {
  assert.equal(srgbToLinear(0.0), 0.0);
  assert.equal(linearToSrgb(0.0), 0.0);
  assert.ok(Math.abs(srgbToLinear(1.0) - 1.0) < 1e-6);
  assert.ok(Math.abs(linearToSrgb(1.0) - 1.0) < 1e-6);

  for (let b = 0; b <= 255; b++) {
    const srgb = b / 255;
    const linear = srgbToLinear(srgb);
    const recovered = linearToSrgb(linear);
    assert.ok(
      Math.abs(recovered - srgb) < 1e-4,
      `Round-trip failure at byte ${b}: srgb=${srgb}, recovered=${recovered}`
    );
  }

  const testVal = 0.5;
  const threeColor = new THREE.Color().setRGB(testVal, testVal, testVal, THREE.SRGBColorSpace);
  assert.ok(
    Math.abs(threeColor.r - srgbToLinear(testVal)) < 1e-6,
    "srgbToLinear must match Three.js ColorManagement sRGB conversion"
  );
});

test("top face THREE.Color correctly interprets sRGB input", () => {
  const srgbTint = [145 / 255, 189 / 255, 89 / 255]; // Plains grass tint

  // Correct instantiation: converts authored sRGB into Three.js working Linear-sRGB
  const biomeColor = new THREE.Color().setRGB(srgbTint[0], srgbTint[1], srgbTint[2], THREE.SRGBColorSpace);

  assert.ok(
    Math.abs(biomeColor.r - srgbToLinear(srgbTint[0])) < 1e-6,
    `Red channel must be linearized: expected ${srgbToLinear(srgbTint[0])}, got ${biomeColor.r}`
  );
  assert.ok(
    Math.abs(biomeColor.g - srgbToLinear(srgbTint[1])) < 1e-6,
    `Green channel must be linearized: expected ${srgbToLinear(srgbTint[1])}, got ${biomeColor.g}`
  );
  assert.ok(
    Math.abs(biomeColor.b - srgbToLinear(srgbTint[2])) < 1e-6,
    `Blue channel must be linearized: expected ${srgbToLinear(srgbTint[2])}, got ${biomeColor.b}`
  );

  // Contrast with raw constructor new THREE.Color(r, g, b), which erroneously treats sRGB values as linear
  const rawColor = new THREE.Color(srgbTint[0], srgbTint[1], srgbTint[2]);
  assert.notEqual(
    rawColor.r,
    biomeColor.r,
    "Raw THREE.Color constructor fails to convert sRGB to linear, preserving skewed gamma coordinates"
  );
  assert.ok(
    biomeColor.r < rawColor.r,
    "Linearized color component must have lower numerical value than sRGB component"
  );
});

test("compositeGrassSideBuffers executes linear-space multiplication", () => {
  // Test midtone pixel with swamp grass tint where gamma vs linear divergence is pronounced
  const swampTint = getBiomeTint("swamp", "grass");
  const dirt = new Uint8Array([134, 96, 67, 255]);
  const overlay = new Uint8Array([100, 100, 100, 255]); // grayscale shadow pixel

  const composited = compositeGrassSideBuffers(dirt, overlay, swampTint, 1, 1);

  // Linear space calculation:
  const expectedLinearR = Math.round(
    linearToSrgb(srgbToLinear(100 / 255) * srgbToLinear(swampTint[0])) * 255
  );
  const naiveGammaR = Math.round(100 * swampTint[0]);

  // Naive gamma space multiplication gives 42, linear gives 37 (5 levels difference)
  assert.equal(naiveGammaR, 42);
  assert.equal(expectedLinearR, 37);
  assert.equal(
    composited[0],
    expectedLinearR,
    `compositeGrassSideBuffers red channel must match linear-space multiplication (${expectedLinearR}), got ${composited[0]}`
  );
  assert.notEqual(
    composited[0],
    naiveGammaR,
    "compositeGrassSideBuffers must not use naive gamma-space multiplication"
  );

  // Green channel
  const expectedLinearG = Math.round(
    linearToSrgb(srgbToLinear(100 / 255) * srgbToLinear(swampTint[1])) * 255
  );
  assert.equal(composited[1], expectedLinearG);

  // Blue channel
  const expectedLinearB = Math.round(
    linearToSrgb(srgbToLinear(100 / 255) * srgbToLinear(swampTint[2])) * 255
  );
  assert.equal(composited[2], expectedLinearB);
});

test("color match between top face material color and side overhang composited overlay without gamma skew across canonical biomes", () => {
  const canonicalBiomes = [
    "plains",
    "desert",
    "forest",
    "taiga",
    "swamp",
    "badlands",
    "snowy_plains"
  ];

  // Test across multiple luminance levels: highlight, midtone, shadow
  const testGrayscaleLevels = [255, 204, 180, 128, 100, 64, 32];

  for (const biomeId of canonicalBiomes) {
    const tint = getBiomeTint(biomeId, "grass");

    // Top face Three.js material color pipeline:
    const topBiomeColor = new THREE.Color().setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);

    for (const gray of testGrayscaleLevels) {
      const dirt = new Uint8Array([134, 96, 67, 255]);
      const overlay = new Uint8Array([gray, gray, gray, 255]);

      // Side overhang composited overlay
      const compositedSide = compositeGrassSideBuffers(dirt, overlay, tint, 1, 1);

      // Top face rendered display pixel:
      // Texture is sRGB, decoded to linear by Three.js shader, multiplied by topBiomeColor (linear),
      // then converted back to sRGB output for display.
      const topLinearR = srgbToLinear(gray / 255) * topBiomeColor.r;
      const topLinearG = srgbToLinear(gray / 255) * topBiomeColor.g;
      const topLinearB = srgbToLinear(gray / 255) * topBiomeColor.b;

      const topDisplayR = Math.min(255, Math.max(0, Math.round(linearToSrgb(topLinearR) * 255)));
      const topDisplayG = Math.min(255, Math.max(0, Math.round(linearToSrgb(topLinearG) * 255)));
      const topDisplayB = Math.min(255, Math.max(0, Math.round(linearToSrgb(topLinearB) * 255)));

      assert.equal(
        compositedSide[0],
        topDisplayR,
        `Biome ${biomeId} gray ${gray}: Red channel mismatch between top face and side overhang`
      );
      assert.equal(
        compositedSide[1],
        topDisplayG,
        `Biome ${biomeId} gray ${gray}: Green channel mismatch between top face and side overhang`
      );
      assert.equal(
        compositedSide[2],
        topDisplayB,
        `Biome ${biomeId} gray ${gray}: Blue channel mismatch between top face and side overhang`
      );
      assert.equal(
        compositedSide[3],
        255,
        `Biome ${biomeId} gray ${gray}: Alpha channel mismatch`
      );
    }
  }
});
