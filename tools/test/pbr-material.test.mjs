import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  F0_CONDUCTOR_THRESHOLD,
  F0_CONDUCTOR_BYTE_THRESHOLD,
  isConductor,
  swizzleNormalVector,
  unpackLabPBRNormal,
  unpackLabPBRSpecular,
  applyLabPBRShader,
  createLabPBRMaterial
} from "../../src/modules/pbr-material.js";
import { COLOR_SPACES } from "../../src/modules/color-space.js";

test("F0 thresholds align with LabPBR 1.3 specification", () => {
  assert.equal(F0_CONDUCTOR_BYTE_THRESHOLD, 230);
  assert.equal(F0_CONDUCTOR_THRESHOLD, 230 / 255);
});

test("isConductor identifies dielectric vs conductor materials across byte and float ranges", () => {
  // Dielectrics in normalized float [0.0..1.0]
  assert.equal(isConductor(0.0), false, "0.0 must be dielectric");
  assert.equal(isConductor(0.04), false, "Common dielectric F0 (0.04) must be dielectric");
  assert.equal(isConductor(0.5), false, "0.5 must be dielectric");
  assert.equal(isConductor(229 / 255), false, "229/255 must be dielectric");

  // Conductors in normalized float [0.0..1.0]
  assert.equal(isConductor(230 / 255), true, "230/255 threshold must be conductor");
  assert.equal(isConductor(0.95), true, "0.95 must be conductor");
  assert.equal(isConductor(1.0), true, "1.0 must be conductor");

  // Dielectrics in byte range [0..255]
  assert.equal(isConductor(10), false, "Byte 10 must be dielectric");
  assert.equal(isConductor(128), false, "Byte 128 must be dielectric");
  assert.equal(isConductor(229), false, "Byte 229 must be dielectric");

  // Conductors in byte range [0..255]
  assert.equal(isConductor(230), true, "Byte 230 must be conductor");
  assert.equal(isConductor(240), true, "Byte 240 must be conductor");
  assert.equal(isConductor(255), true, "Byte 255 must be conductor");

  // Edge cases and strings
  assert.equal(isConductor("230"), true);
  assert.equal(isConductor("10"), false);
  assert.equal(isConductor(null), false);
  assert.equal(isConductor(undefined), false);
  assert.equal(isConductor(NaN), false);
});

test("swizzleNormalVector flips DirectX Y- to OpenGL Y+ for normalized float inputs", () => {
  const sample = { r: 0.75, g: 0.2, b: 1.0 };
  const swizzled = swizzleNormalVector(sample);

  assert.equal(swizzled.x, 0.75);
  assert.equal(swizzled.r, 0.75);
  assert.equal(swizzled.y, 0.8, "Y must flip from 0.2 to 1.0 - 0.2 = 0.8");
  assert.equal(swizzled.g, 0.8);
  assert.equal(swizzled.z, 1.0);
  assert.equal(swizzled.b, 1.0);

  // Array destructuring & indexing
  const [x, y, z] = swizzled;
  assert.equal(x, 0.75);
  assert.equal(y, 0.8);
  assert.equal(z, 1.0);
  assert.equal(swizzled[1], 0.8);
  assert.deepEqual(swizzled.toArray(), [0.75, 0.8, 1.0]);
});

test("swizzleNormalVector supports array and positional arguments", () => {
  const fromArray = swizzleNormalVector([0.5, 0.1, 0.9]);
  assert.equal(fromArray.x, 0.5);
  assert.equal(fromArray.y, 0.9); // 1.0 - 0.1

  const fromArgs = swizzleNormalVector(0.4, 0.3, 0.8);
  assert.equal(fromArgs.x, 0.4);
  assert.equal(fromArgs.y, 0.7); // 1.0 - 0.3
});

test("swizzleNormalVector handles byte range [0..255] and signed tangent vectors [-1..1]", () => {
  // Byte input
  const byteSample = { r: 128, g: 200, b: 255 };
  const byteSwizzled = swizzleNormalVector(byteSample);
  assert.equal(byteSwizzled.x, 128);
  assert.equal(byteSwizzled.y, 55, "Byte Y must flip to 255 - 200 = 55");

  // Signed tangent space input [-1..1]
  const signedSample = { x: 0.2, y: -0.6, z: 0.77 };
  const signedSwizzled = swizzleNormalVector(signedSample);
  assert.equal(signedSwizzled.x, 0.2);
  assert.equal(signedSwizzled.y, 0.6, "Signed vector Y must negate -(-0.6) = 0.6");
});

test("unpackLabPBRNormal unpacks channels and flips DirectX Y- to OpenGL", () => {
  const unpacked = unpackLabPBRNormal(0.6, 0.3, 0.85, 0.4);

  assert.equal(unpacked.normalX, 0.6, "Normal X matches Red");
  assert.equal(unpacked.normalY, 0.7, "Normal Y flips from Green (1.0 - 0.3 = 0.7)");
  assert.equal(unpacked.ao, 0.85, "AO matches Blue");
  assert.equal(unpacked.height, 0.4, "Height matches Alpha");

  // Verify reconstructed tangent normal vector
  const expectedNx = 0.6 * 2.0 - 1.0;
  const expectedNy = 0.7 * 2.0 - 1.0;
  const expectedNz = Math.sqrt(Math.max(0.0, 1.0 - (expectedNx * expectedNx + expectedNy * expectedNy)));

  assert.ok(Math.abs(unpacked.normalVector.x - expectedNx) < 1e-6);
  assert.ok(Math.abs(unpacked.normalVector.y - expectedNy) < 1e-6);
  assert.ok(Math.abs(unpacked.normalVector.z - expectedNz) < 1e-6);
});

test("unpackLabPBRNormal supports byte inputs and object payloads", () => {
  const byteObj = { r: 128, g: 64, b: 200, a: 150 };
  const unpacked = unpackLabPBRNormal(byteObj);

  assert.ok(Math.abs(unpacked.normalX - (128 / 255)) < 1e-5);
  assert.ok(Math.abs(unpacked.normalY - (1.0 - 64 / 255)) < 1e-5);
  assert.ok(Math.abs(unpacked.ao - (200 / 255)) < 1e-5);
  assert.ok(Math.abs(unpacked.height - (150 / 255)) < 1e-5);
});

test("unpackLabPBRSpecular unpacks smoothness inversion, F0 metalness, and emission", () => {
  // Test Case 1: Dielectric (stone/dirt-like)
  // Smoothness = 0.2 (rough), F0 = 0.04 (dielectric), Porosity = 0.1, Emission = 0.0
  const dielectric = unpackLabPBRSpecular(0.2, 0.04, 0.1, 0.0);
  assert.equal(dielectric.smoothness, 0.2);
  assert.equal(dielectric.roughness, 0.8, "Roughness must be 1.0 - Smoothness = 0.8");
  assert.equal(dielectric.isConductor, false);
  assert.equal(dielectric.metalness, 0.0, "Dielectric metalness must be 0.0");
  assert.equal(dielectric.porosity, 0.1);
  assert.equal(dielectric.emission, 0.0);

  // Test Case 2: Conductor (gold/iron-like)
  // Smoothness = 0.9 (shiny), F0 = 240 (conductor byte), Porosity = 0.0, Emission = 0.5
  const conductor = unpackLabPBRSpecular(0.9, 240, 0.0, 0.5);
  assert.equal(conductor.smoothness, 0.9);
  assert.ok(Math.abs(conductor.roughness - 0.1) < 1e-6, "Roughness must be 1.0 - 0.9 = 0.1");
  assert.equal(conductor.isConductor, true);
  assert.equal(conductor.metalness, 1.0, "Conductor metalness must be 1.0");
  assert.equal(conductor.emission, 0.5, "Emission extracted from Alpha");

  // Test Case 3: Object payload with byte smoothness
  const byteObj = { r: 255, g: 10, b: 0, a: 254 };
  const unpackedByte = unpackLabPBRSpecular(byteObj);
  assert.equal(unpackedByte.smoothness, 1.0);
  assert.equal(unpackedByte.roughness, 0.0, "Max smoothness produces 0.0 roughness (mirror)");
  assert.equal(unpackedByte.metalness, 0.0);
  assert.ok(Math.abs(unpackedByte.emission - (254 / 255)) < 1e-5);
});

test("createLabPBRMaterial creates Three.js MeshStandardMaterial with configured textures", () => {
  const albedoTexture = new THREE.Texture();
  const normalTexture = new THREE.Texture();
  const specularTexture = new THREE.Texture();

  const material = createLabPBRMaterial({
    albedoMap: albedoTexture,
    normalMap: normalTexture,
    specularMap: specularTexture,
    roughness: 0.9,
    metalness: 0.8
  });

  assert.ok(material instanceof THREE.MeshStandardMaterial);
  assert.strictEqual(material.map, albedoTexture);
  assert.strictEqual(material.normalMap, normalTexture);
  assert.strictEqual(material.specularMap, specularTexture);
  assert.equal(material.userData.isLabPBR, true);

  // Verify texture color spaces
  assert.equal(albedoTexture.colorSpace, COLOR_SPACES.SRGB, "Albedo map must use sRGB color space");
  assert.equal(normalTexture.colorSpace, COLOR_SPACES.NO_COLOR, "Normal map must use NoColorSpace");
  assert.equal(specularTexture.colorSpace, COLOR_SPACES.NO_COLOR, "Specular map must use NoColorSpace");
});

test("createLabPBRMaterial supports MeshPhysicalMaterial via usePhysical option", () => {
  const material = createLabPBRMaterial({
    usePhysical: true,
    roughness: 0.5
  });

  assert.ok(material instanceof THREE.MeshPhysicalMaterial);
});

test("createLabPBRMaterial accepts map as alias for albedoMap", () => {
  const texture = new THREE.Texture();
  const material = createLabPBRMaterial({ map: texture });
  assert.strictEqual(material.map, texture);
  assert.equal(texture.colorSpace, COLOR_SPACES.SRGB);
});

test("applyLabPBRShader injects uniforms and onBeforeCompile shader hook", () => {
  const normalTex = new THREE.Texture();
  const specularTex = new THREE.Texture();

  const material = new THREE.MeshStandardMaterial({
    normalMap: normalTex
  });
  material.specularMap = specularTex;

  applyLabPBRShader(material, {
    normalMap: normalTex,
    specularMap: specularTex,
    aoIntensity: 0.75
  });

  assert.equal(material.defines.USE_LABPBR_SPECULAR, "1");
  assert.equal(material.defines.USE_LABPBR_NORMAL, "1");

  // Simulate Three.js shader compilation pass
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };

  material.onBeforeCompile(shader);

  // 1. Verify Uniforms injected
  assert.ok(shader.uniforms.specularMap, "specularMap uniform must be injected");
  assert.strictEqual(shader.uniforms.specularMap.value, specularTex);
  assert.ok(shader.uniforms.labpbrAoIntensity, "labpbrAoIntensity uniform must be injected");
  assert.equal(shader.uniforms.labpbrAoIntensity.value, 0.75);

  // 2. Verify Fragment Shader declarations
  assert.ok(
    shader.fragmentShader.includes("uniform sampler2D specularMap;"),
    "Fragment shader must declare specularMap uniform"
  );
  assert.ok(
    shader.fragmentShader.includes("uniform float labpbrAoIntensity;"),
    "Fragment shader must declare labpbrAoIntensity uniform"
  );

  // 3. Verify Normal channel unpacking (DirectX Y-flip, AO, Height)
  assert.ok(
    shader.fragmentShader.includes("( 1.0 - labpbrNormalTex.g )"),
    "Fragment shader must flip DirectX Y- to OpenGL (1.0 - g)"
  );
  assert.ok(
    shader.fragmentShader.includes("labpbrNormalTex.r * 2.0 - 1.0"),
    "Fragment shader must unpack Normal X from Red"
  );
  assert.ok(
    shader.fragmentShader.includes("mix( 1.0, labpbrNormalTex.b, labpbrAoIntensity )"),
    "Fragment shader must apply AO from NormalTex.b"
  );

  // 4. Verify Specular channel unpacking (Smoothness inversion, F0 metalness, Emission)
  assert.ok(
    shader.fragmentShader.includes("( 1.0 - labpbrSpecularTex.r ) * roughness"),
    "Fragment shader must invert smoothness to roughness (1.0 - r)"
  );
  assert.ok(
    shader.fragmentShader.includes("step( 229.5 / 255.0, labpbrSpecularTex.g )"),
    "Fragment shader must threshold F0 metalness (dielectric vs conductor)"
  );
  assert.ok(
    shader.fragmentShader.includes("labpbrSpecularTex.a * emissiveIntensity"),
    "Fragment shader must unpack emission from SpecularTex.a"
  );
});

test("applyLabPBRShader chains pre-existing onBeforeCompile callback", () => {
  let userHookCalled = false;
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = () => {
    userHookCalled = true;
  };

  applyLabPBRShader(material);

  const shader = {
    uniforms: {},
    vertexShader: "",
    fragmentShader: ""
  };
  material.onBeforeCompile(shader);

  assert.equal(userHookCalled, true, "User onBeforeCompile callback must be preserved and invoked");
});

test("customProgramCacheKey generates unique cache keys based on active maps", () => {
  const mat1 = createLabPBRMaterial();
  const key1 = mat1.customProgramCacheKey();

  const normalTex = new THREE.Texture();
  const mat2 = createLabPBRMaterial({ normalMap: normalTex });
  const key2 = mat2.customProgramCacheKey();

  const specTex = new THREE.Texture();
  const mat3 = createLabPBRMaterial({ normalMap: normalTex, specularMap: specTex });
  const key3 = mat3.customProgramCacheKey();

  assert.notEqual(key1, key2);
  assert.notEqual(key2, key3);
});