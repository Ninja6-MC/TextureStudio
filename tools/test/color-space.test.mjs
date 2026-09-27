import test from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_SPACES,
  getColorSpaceForRole,
  configureTextureColorSpace
} from "../../src/modules/color-space.js";

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
