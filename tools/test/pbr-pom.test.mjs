import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  POM_MIN_DEPTH_SCALE,
  POM_MAX_DEPTH_SCALE,
  POM_DEFAULT_DEPTH_SCALE,
  POM_DEFAULT_MIN_SAMPLES,
  POM_DEFAULT_MAX_SAMPLES,
  clampDepthScale,
  calculatePomSamples,
  clampPomUv,
  simulatePomRaymarch,
  raymarchHeightLayers,
  applyPOM
} from "../../src/modules/pbr-pom.js";
import {
  createLabPBRMaterial,
  applyLabPBRShader
} from "../../src/modules/pbr-material.js";

test("calculatePomSamples scales sample count dynamically with view angle", () => {
  // Perpendicular view (viewZ = 1.0): 8 samples
  assert.equal(calculatePomSamples(1.0), 8.0, "Perpendicular view must produce 8 samples");
  assert.equal(calculatePomSamples(1.0, 8.0, 32.0), 8.0);

  // Grazing angle view (viewZ = 0.0): 32 samples
  assert.equal(calculatePomSamples(0.0), 32.0, "Grazing angle view must produce 32 samples");
  assert.equal(calculatePomSamples(0.0, 8.0, 32.0), 32.0);

  // 45 degree angle (viewZ = 0.5): 20 samples
  assert.equal(calculatePomSamples(0.5), 20.0, "45-degree angle must linearly interpolate to 20 samples");

  // Handles negative viewZ values (Math.abs)
  assert.equal(calculatePomSamples(-1.0), 8.0);
  assert.equal(calculatePomSamples(-0.5), 20.0);

  // Clamps out-of-bounds viewZ
  assert.equal(calculatePomSamples(1.5), 8.0);
  assert.equal(calculatePomSamples(-2.0), 8.0);

  // Custom min and max sample ranges
  assert.equal(calculatePomSamples(1.0, 16.0, 64.0), 16.0);
  assert.equal(calculatePomSamples(0.0, 16.0, 64.0), 64.0);
  assert.equal(calculatePomSamples(0.5, 16.0, 64.0), 40.0);
});

test("clampDepthScale constrains depth scale to [0.0, 0.2] range with default fallback", () => {
  assert.equal(clampDepthScale(0.05), 0.05);
  assert.equal(clampDepthScale(0.0), 0.0);
  assert.equal(clampDepthScale(0.2), 0.2);
  assert.equal(clampDepthScale(0.12), 0.12);

  // Clamping outside bounds
  assert.equal(clampDepthScale(-0.1), POM_MIN_DEPTH_SCALE, "Negative depth scale must clamp to 0.0");
  assert.equal(clampDepthScale(0.5), POM_MAX_DEPTH_SCALE, "Excessive depth scale must clamp to 0.2");
  assert.equal(clampDepthScale(1.0), 0.2);

  // Default fallback for invalid or missing inputs
  assert.equal(clampDepthScale(undefined), POM_DEFAULT_DEPTH_SCALE);
  assert.equal(clampDepthScale(null), POM_DEFAULT_DEPTH_SCALE);
  assert.equal(clampDepthScale(NaN), POM_DEFAULT_DEPTH_SCALE);
  assert.equal(clampDepthScale("not-a-number"), POM_DEFAULT_DEPTH_SCALE);

  // String parsing
  assert.equal(clampDepthScale("0.15"), 0.15);
  assert.equal(clampDepthScale("-0.05"), 0.0);
});

test("clampPomUv clamps UV coordinates to [0.0, 1.0] and supports array/object destructuring", () => {
  // Array coordinates
  const clampedArray = clampPomUv([-0.2, 1.4]);
  assert.equal(clampedArray[0], 0.0);
  assert.equal(clampedArray[1], 1.0);
  assert.equal(clampedArray.x, 0.0);
  assert.equal(clampedArray.y, 1.0);
  assert.equal(clampedArray.u, 0.0);
  assert.equal(clampedArray.v, 1.0);
  assert.deepEqual(clampedArray.toArray(), [0.0, 1.0]);

  // Object coordinates with x, y
  const clampedXY = clampPomUv({ x: 0.45, y: -0.1 });
  assert.equal(clampedXY.x, 0.45);
  assert.equal(clampedXY.y, 0.0);

  // Object coordinates with u, v
  const clampedUV = clampPomUv({ u: 1.25, v: 0.75 });
  assert.equal(clampedUV.u, 1.0);
  assert.equal(clampedUV.v, 0.75);

  // In-bounds values unchanged
  const [inU, inV] = clampPomUv([0.3, 0.7]);
  assert.equal(inU, 0.3);
  assert.equal(inV, 0.7);
});

test("simulatePomRaymarch produces zero offset on flat un-displaced surface (height = 1.0)", () => {
  const result = simulatePomRaymarch({
    uv: [0.5, 0.5],
    viewVector: [1.0, 0.0, 1.0],
    sampleHeight: () => 1.0,
    depthScale: 0.1
  });

  assert.equal(result.offset.x, 0.0, "Surface at max height must produce zero UV offset");
  assert.equal(result.offset.y, 0.0);
  assert.equal(result.uv.x, 0.5);
  assert.equal(result.uv.y, 0.5);
  assert.equal(result.depth, 0.0, "Surface depth must be 0.0");
  assert.equal(result.samples, 0, "No raymarching steps required on top surface");
});

test("simulatePomRaymarch calculates accurate parallax offset on recessed flat surface (height = 0.5)", () => {
  // At 45 degree angle in X (vx = 1, vz = 1 => vx/vz = 1)
  // Height = 0.5 => surface depth = 1.0 - 0.5 = 0.5
  // Expected UV shift: - (vx / vz) * depthScale * depth = - 1.0 * 0.1 * 0.5 = -0.05
  const result = simulatePomRaymarch({
    uv: [0.5, 0.5],
    viewVector: [1.0, 0.0, 1.0],
    sampleHeight: () => 0.5,
    depthScale: 0.1,
    minSamples: 8,
    maxSamples: 32
  });

  assert.ok(Math.abs(result.depth - 0.5) < 1e-5, "Ray must intersect at depth 0.5");
  assert.ok(Math.abs(result.offset.x - (-0.05)) < 1e-5, "UV offset in X must be -0.05");
  assert.ok(Math.abs(result.offset.y - 0.0) < 1e-5, "UV offset in Y must be 0.0");
  assert.ok(Math.abs(result.uv.x - 0.45) < 1e-5, "Displaced UV X must be 0.45");
  assert.ok(Math.abs(result.uv.y - 0.5) < 1e-5, "Displaced UV Y must be 0.5");
  assert.ok(result.samples > 0, "Raymarch must take steps through height layers");
});

test("simulatePomRaymarch performs sub-layer linear interpolation against continuous height ramp", () => {
  // Linear ramp height function: h(u) = 0.2 + 0.6 * u
  // Depth function: d(u) = 1.0 - h(u) = 0.8 - 0.6 * u
  const rampHeight = (u) => 0.2 + 0.6 * u;

  const result = simulatePomRaymarch({
    uv: [0.5, 0.5],
    viewVector: [0.5, 0.0, 1.0],
    sampleHeight: rampHeight,
    depthScale: 0.1
  });

  // Verify that the interpolated ray depth matches the sampled surface height at the final UV
  const surfaceHeightAtHit = rampHeight(result.uv.x);
  const surfaceDepthAtHit = 1.0 - surfaceHeightAtHit;

  assert.ok(
    Math.abs(result.depth - surfaceDepthAtHit) < 1e-4,
    "Interpolated ray depth must match the surface depth at the intersection point"
  );
  assert.ok(result.depth > 0.0 && result.depth < 1.0);
  assert.ok(result.samples >= 1);
});

test("simulatePomRaymarch clamps out-of-bounds UV offsets to [0, 1] range", () => {
  // Ray starts near boundary (u = 0.02) and marches strongly in -X direction
  const result = simulatePomRaymarch({
    uv: [0.02, 0.5],
    viewVector: [2.0, 0.0, 0.2], // Steep grazing view pointing in +X
    sampleHeight: () => 0.0,     // Deep pit (depth = 1.0)
    depthScale: 0.2,
    clamp: true
  });

  assert.equal(result.uv.x, 0.0, "UV X must be clamped at lower bound 0.0");
  assert.ok(result.uv.x >= 0.0 && result.uv.x <= 1.0);
  assert.ok(result.uv.y >= 0.0 && result.uv.y <= 1.0);
});

test("simulatePomRaymarch supports positional and alternative call signatures", () => {
  const sampler = () => 0.7;

  // Signature: (heightSampler, uv, viewDirTangent, depthScale, options)
  const res1 = simulatePomRaymarch(sampler, [0.5, 0.5], [1.0, 0.0, 1.0], 0.1, { minSamples: 8, maxSamples: 16 });
  assert.ok(Math.abs(res1.depth - 0.3) < 1e-4);

  // Signature: (uv, viewDirTangent, heightSampler, depthScale, minSamples, maxSamples)
  const res2 = simulatePomRaymarch([0.5, 0.5], [1.0, 0.0, 1.0], sampler, 0.1, 8, 16);
  assert.ok(Math.abs(res2.depth - 0.3) < 1e-4);

  // Alias raymarchHeightLayers matches simulatePomRaymarch
  assert.strictEqual(raymarchHeightLayers, simulatePomRaymarch);
});

test("applyPOM injects defines, userData, and Three.js onBeforeCompile shader hooks", () => {
  const normalTexture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ normalMap: normalTexture });

  applyPOM(material, {
    pomEnabled: true,
    depthScale: 0.08,
    minSamples: 10,
    maxSamples: 24
  });

  assert.equal(material.defines.USE_POM, "1", "USE_POM define must be present on material");
  assert.equal(material.userData.pomEnabled, true);
  assert.equal(material.userData.pomDepthScale, 0.08);
  assert.equal(material.userData.pomMinSamples, 10);
  assert.equal(material.userData.pomMaxSamples, 24);

  // Simulate Three.js shader compilation pass
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };

  material.onBeforeCompile(shader);

  // 1. Verify Uniforms injected
  assert.ok(shader.uniforms.uPomEnabled, "uPomEnabled uniform must be injected");
  assert.equal(shader.uniforms.uPomEnabled.value, 1.0);
  assert.ok(shader.uniforms.uPomDepthScale, "uPomDepthScale uniform must be injected");
  assert.equal(shader.uniforms.uPomDepthScale.value, 0.08);
  assert.ok(shader.uniforms.uPomMinSamples, "uPomMinSamples uniform must be injected");
  assert.equal(shader.uniforms.uPomMinSamples.value, 10);
  assert.ok(shader.uniforms.uPomMaxSamples, "uPomMaxSamples uniform must be injected");
  assert.equal(shader.uniforms.uPomMaxSamples.value, 24);

  // 2. Verify Vertex Shader modifications
  assert.ok(
    shader.vertexShader.includes("varying vec3 vTangentView;"),
    "Vertex shader must declare vTangentView varying"
  );
  assert.ok(
    shader.vertexShader.includes("dot( - mvPosition.xyz, normalize( transformedTangent ) )"),
    "Vertex shader must transform view vector to tangent space when tangents are available"
  );

  // 3. Verify Fragment Shader declarations and algorithms
  assert.ok(
    shader.fragmentShader.includes("uniform float uPomEnabled;"),
    "Fragment shader must declare uPomEnabled"
  );
  assert.ok(
    shader.fragmentShader.includes("uniform float uPomDepthScale;"),
    "Fragment shader must declare uPomDepthScale"
  );
  assert.ok(
    shader.fragmentShader.includes("mat3 pomGetTangentFrame("),
    "Fragment shader must declare pomGetTangentFrame for TBN construction"
  );
  assert.ok(
    shader.fragmentShader.includes("vec2 parallaxOcclusionMapping("),
    "Fragment shader must declare parallaxOcclusionMapping function"
  );
  assert.ok(
    shader.fragmentShader.includes("clamp( finalUv, 0.0, 1.0 )"),
    "Fragment shader must clamp POM UV to prevent quad seam leakage"
  );
  assert.ok(
    shader.fragmentShader.includes("texture2D( map, pomUv )"),
    "Fragment shader must sample diffuse map with displaced pomUv"
  );
});

test("applyPOM uniforms support real-time reactive updates via material.userData and direct uniform setters", () => {
  const material = new THREE.MeshStandardMaterial();
  applyPOM(material, {
    pomEnabled: true,
    depthScale: 0.05
  });

  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };

  material.onBeforeCompile(shader);

  // Initial state
  assert.equal(shader.uniforms.uPomEnabled.value, 1.0);
  assert.equal(shader.uniforms.uPomDepthScale.value, 0.05);

  // Reactive toggle via userData
  material.userData.pomEnabled = false;
  assert.equal(shader.uniforms.uPomEnabled.value, 0.0, "Uniform must dynamically reflect disabled toggle");

  // Reactive depth scale update via userData
  material.userData.pomDepthScale = 0.14;
  assert.equal(shader.uniforms.uPomDepthScale.value, 0.14, "Uniform must dynamically reflect depth scale changes");

  // Setting uniform directly updates material.userData
  shader.uniforms.uPomDepthScale.value = 0.18;
  assert.equal(shader.uniforms.uPomDepthScale.value, 0.18);
  assert.equal(material.userData.pomDepthScale, 0.18);

  // Out-of-bounds scale assigned to uniform is clamped
  shader.uniforms.uPomDepthScale.value = 0.5;
  assert.equal(shader.uniforms.uPomDepthScale.value, 0.2, "Depth scale set to uniform must be clamped to 0.2");
});

test("applyPOM chains pre-existing onBeforeCompile callbacks", () => {
  let existingHookExecuted = false;
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = () => {
    existingHookExecuted = true;
  };

  applyPOM(material);

  const shader = {
    uniforms: {},
    vertexShader: "",
    fragmentShader: ""
  };
  material.onBeforeCompile(shader);

  assert.equal(existingHookExecuted, true, "Existing onBeforeCompile hook must execute");
});

test("applyPOM customProgramCacheKey distinguishes POM states and chains parent keys", () => {
  const mat1 = new THREE.MeshStandardMaterial();
  mat1.customProgramCacheKey = () => "parent_cache";
  applyPOM(mat1);

  const key1 = mat1.customProgramCacheKey();
  assert.equal(key1, "parent_cache|pom_1");

  mat1.defines.USE_POM = undefined;
  delete mat1.defines.USE_POM;
  const key2 = mat1.customProgramCacheKey();
  assert.equal(key2, "parent_cache|pom_0");
});

test("createLabPBRMaterial integrates POM configuration cleanly", () => {
  const albedoTex = new THREE.Texture();
  const normalTex = new THREE.Texture();
  const specTex = new THREE.Texture();

  // 1. Create with pom: true
  const matPom = createLabPBRMaterial({
    albedoMap: albedoTex,
    normalMap: normalTex,
    specularMap: specTex,
    pom: true,
    depthScale: 0.12,
    minSamples: 12,
    maxSamples: 28
  });

  assert.equal(matPom.defines.USE_POM, "1", "createLabPBRMaterial must enable USE_POM define");
  assert.equal(matPom.userData.pomEnabled, true);
  assert.equal(matPom.userData.pomDepthScale, 0.12);
  assert.equal(matPom.userData.pomMinSamples, 12);
  assert.equal(matPom.userData.pomMaxSamples, 28);

  // 2. Create with pom options object
  const matPomObj = createLabPBRMaterial({
    albedoMap: albedoTex,
    normalMap: normalTex,
    pom: {
      enabled: true,
      depthScale: 0.15,
      minSamples: 16,
      maxSamples: 32
    }
  });

  assert.equal(matPomObj.defines.USE_POM, "1");
  assert.equal(matPomObj.userData.pomDepthScale, 0.15);
  assert.equal(matPomObj.userData.pomMinSamples, 16);

  // 3. Verify shader pipeline uses pomUv for normal and roughness maps
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };

  matPom.onBeforeCompile(shader);

  assert.ok(shader.uniforms.uPomEnabled);
  assert.equal(shader.uniforms.uPomDepthScale.value, 0.12);
  assert.ok(
    shader.fragmentShader.includes("labpbrNormalTex = texture2D( normalMap, pomUv );"),
    "LabPBR normal map must sample at displaced pomUv when POM is active"
  );
  assert.ok(
    shader.fragmentShader.includes("vec2 labpbrSpecUv = pomUv;"),
    "LabPBR specular map must sample at displaced pomUv when POM is active"
  );
});
