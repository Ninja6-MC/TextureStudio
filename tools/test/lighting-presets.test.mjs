import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  LIGHTING_PRESETS,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_TONE_MAPPING,
  DEFAULT_TONE_MAPPING_EXPOSURE,
  configureToneMapping,
  LightingRig,
  createLightingRig,
  applyLightingPreset,
  calculateSunPosition,
  calculateSunAngles,
  setSunAngle,
  getLightingPreset,
  registerLightingPreset,
  normalizeHexColor,
  hexToNumber,
  normalizePresetId
} from "../../src/modules/lighting-presets.js";

function assertNear(actual, expected, tolerance = 1e-4, message = "") {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `${message} Expected ${actual} to be near ${expected} (diff: ${diff}, tolerance: ${tolerance})`
  );
}

// -----------------------------------------------------------------------------
// 1. Preset Registry & Canonical Configuration Tests
// -----------------------------------------------------------------------------

test("LIGHTING_PRESETS registry exposes canonical presets and default ID", () => {
  assert.ok(LIGHTING_PRESETS["trailer-golden-hour"], "trailer-golden-hour must exist");
  assert.ok(LIGHTING_PRESETS["noon-clear"], "noon-clear must exist");
  assert.ok(LIGHTING_PRESETS["studio-neutral"], "studio-neutral must exist");
  assert.equal(DEFAULT_LIGHTING_PRESET, "studio-neutral");
});

test("Trailer Golden Hour preset defines authentic cinematic trailer lighting with calibrated intensities", () => {
  const preset = LIGHTING_PRESETS["trailer-golden-hour"];
  assert.equal(preset.id, "trailer-golden-hour");
  assert.equal(preset.name, "Trailer Golden Hour");

  // Calibrated warm directional amber sunlight (#ffb366, intensity 1.2, elevation ~25-30, azimuth ~45-60)
  assert.equal(preset.sun.hex, "#ffb366");
  assert.equal(preset.sun.colorHex, 0xffb366);
  assert.equal(preset.sun.intensity, 1.2);
  assert.ok(preset.sun.elevation >= 25 && preset.sun.elevation <= 30, "elevation should be ~25-30 deg");
  assert.ok(preset.sun.azimuth >= 45 && preset.sun.azimuth <= 60, "azimuth should be ~45-60 deg");
  assert.equal(preset.sun.castShadow, true);

  // Calibrated cool blue sky ambient fill (#8ca0ba, intensity 0.4)
  assert.equal(preset.ambient.hex, "#8ca0ba");
  assert.equal(preset.ambient.colorHex, 0x8ca0ba);
  assert.equal(preset.ambient.intensity, 0.4);
});

test("Noon Clear preset defines neutral sunlight and balanced ambient fill", () => {
  const preset = LIGHTING_PRESETS["noon-clear"];
  assert.equal(preset.id, "noon-clear");
  assert.equal(preset.name, "Noon Clear");

  // Neutral sunlight (#ffffff, intensity 1.5, high elevation ~80-90)
  assert.equal(preset.sun.hex, "#ffffff");
  assert.equal(preset.sun.colorHex, 0xffffff);
  assert.equal(preset.sun.intensity, 1.5);
  assert.ok(preset.sun.elevation >= 80 && preset.sun.elevation <= 90, "elevation should be ~80-90 deg");
  assert.equal(preset.sun.castShadow, true);

  // Balanced ambient fill (#ffffff, intensity 0.8)
  assert.equal(preset.ambient.hex, "#ffffff");
  assert.equal(preset.ambient.colorHex, 0xffffff);
  assert.equal(preset.ambient.intensity, 0.8);
});

test("Studio Neutral preset defines multi-angle diffuse 3-point lighting setup for true neutral inspection", () => {
  const preset = LIGHTING_PRESETS["studio-neutral"];
  assert.equal(preset.id, "studio-neutral");
  assert.equal(preset.name, "Studio Neutral");

  // Key light: directional light (neutral white #ffffff, intensity 1.0, high front-right)
  assert.equal(preset.sun.hex, "#ffffff");
  assert.equal(preset.sun.colorHex, 0xffffff);
  assertNear(preset.sun.intensity, 1.0);
  assert.deepEqual(preset.sun.position, [5, 10, 7]);

  // Ambient fill: neutral white (#ffffff, intensity 0.4)
  assert.equal(preset.ambient.hex, "#ffffff");
  assert.equal(preset.ambient.colorHex, 0xffffff);
  assertNear(preset.ambient.intensity, 0.4);

  // Fill light: front-left (#ffffff, intensity 0.3)
  assert.ok(preset.fill, "fill light must be defined");
  assert.equal(preset.fill.hex, "#ffffff");
  assert.equal(preset.fill.colorHex, 0xffffff);
  assertNear(preset.fill.intensity, 0.3);
  assert.deepEqual(preset.fill.position, [-5, 2, -5]);

  // Rim/back light or bottom bounce: directional light back/bottom (#ffffff, intensity 0.2)
  assert.ok(preset.rim, "rim light must be defined");
  assert.equal(preset.rim.hex, "#ffffff");
  assert.equal(preset.rim.colorHex, 0xffffff);
  assertNear(preset.rim.intensity, 0.2);
  assert.deepEqual(preset.rim.position, [0, -8, 0]);

  // extraLights registry contains fill and rim lights
  assert.equal(preset.extraLights.length, 2);
  assert.equal(preset.extraLights[0].id, "fill");
  assert.equal(preset.extraLights[0].hex, "#ffffff");
  assertNear(preset.extraLights[0].intensity, 0.3);
  assert.equal(preset.extraLights[1].id, "rim");
  assert.equal(preset.extraLights[1].hex, "#ffffff");
  assertNear(preset.extraLights[1].intensity, 0.2);
});

test("getLightingPreset supports case-insensitive, whitespace-tolerant and alias lookup", () => {
  // Exact canonical ID
  assert.strictEqual(getLightingPreset("trailer-golden-hour"), LIGHTING_PRESETS["trailer-golden-hour"]);
  assert.strictEqual(getLightingPreset("noon-clear"), LIGHTING_PRESETS["noon-clear"]);
  assert.strictEqual(getLightingPreset("studio-neutral"), LIGHTING_PRESETS["studio-neutral"]);

  // Casing and whitespace
  assert.strictEqual(getLightingPreset("  TRAILER-GOLDEN-HOUR  "), LIGHTING_PRESETS["trailer-golden-hour"]);
  assert.strictEqual(getLightingPreset("Trailer Golden Hour"), LIGHTING_PRESETS["trailer-golden-hour"]);
  assert.strictEqual(getLightingPreset("Noon Clear"), LIGHTING_PRESETS["noon-clear"]);
  assert.strictEqual(getLightingPreset("  studio_neutral \t"), LIGHTING_PRESETS["studio-neutral"]);

  // Aliases
  assert.strictEqual(getLightingPreset("golden-hour"), LIGHTING_PRESETS["trailer-golden-hour"]);
  assert.strictEqual(getLightingPreset("golden"), LIGHTING_PRESETS["trailer-golden-hour"]);
  assert.strictEqual(getLightingPreset("trailer"), LIGHTING_PRESETS["trailer-golden-hour"]);
  assert.strictEqual(getLightingPreset("noon"), LIGHTING_PRESETS["noon-clear"]);
  assert.strictEqual(getLightingPreset("daylight"), LIGHTING_PRESETS["noon-clear"]);
  assert.strictEqual(getLightingPreset("studio"), LIGHTING_PRESETS["studio-neutral"]);
  assert.strictEqual(getLightingPreset("3-point"), LIGHTING_PRESETS["studio-neutral"]);

  // Preset object pass-through
  assert.strictEqual(getLightingPreset(LIGHTING_PRESETS["noon-clear"]), LIGHTING_PRESETS["noon-clear"]);
  assert.strictEqual(getLightingPreset({ id: "noon-clear" }), LIGHTING_PRESETS["noon-clear"]);

  // Invalid / missing
  assert.strictEqual(getLightingPreset("non-existent-preset"), null);
  assert.strictEqual(getLightingPreset(""), null);
  assert.strictEqual(getLightingPreset(null), null);
});

test("registerLightingPreset allows dynamic custom preset registration", () => {
  const custom = registerLightingPreset({
    id: "night-moonlight",
    name: "Night Moonlight",
    sun: {
      color: "#4a6984",
      intensity: 0.4,
      azimuth: 200,
      elevation: 60
    },
    ambient: {
      color: "#1a2430",
      intensity: 0.2
    }
  });

  assert.equal(custom.id, "night-moonlight");
  assert.strictEqual(getLightingPreset("night-moonlight"), custom);
  assert.strictEqual(getLightingPreset("Night Moonlight"), custom);
  assert.strictEqual(getLightingPreset("  NIGHT_MOONLIGHT "), custom);

  assert.throws(() => registerLightingPreset(null), TypeError);
  assert.throws(() => registerLightingPreset({}), Error);
});

test("color conversion utilities handle hex strings and numeric values", () => {
  assert.equal(normalizeHexColor(0xffb366), "#ffb366");
  assert.equal(normalizeHexColor("#FFB366"), "#ffb366");
  assert.equal(normalizeHexColor("ffb366"), "#ffb366");
  assert.equal(normalizeHexColor("invalid"), "#ffffff");

  assert.equal(hexToNumber("#ffb366"), 0xffb366);
  assert.equal(hexToNumber("ffb366"), 0xffb366);
  assert.equal(hexToNumber(0xffb366), 0xffb366);
  assert.equal(hexToNumber("invalid"), 0xffffff);

  assert.equal(normalizePresetId("  Trailer Golden_Hour  "), "trailer-golden-hour");
});
// -----------------------------------------------------------------------------
// 2. Trigonometry & Sun Position Calculations Tests
// -----------------------------------------------------------------------------

test("calculateSunPosition computes accurate Zenith coordinates and direction", () => {
  const res = calculateSunPosition({ azimuth: 0, elevation: 90, distance: 100 });
  assertNear(res.x, 0, 1e-6);
  assertNear(res.y, 100, 1e-6);
  assertNear(res.z, 0, 1e-6);

  assertNear(res.direction.x, 0, 1e-6);
  assertNear(res.direction.y, 1, 1e-6);
  assertNear(res.direction.z, 0, 1e-6);

  assertNear(res.rayDirection.x, 0, 1e-6);
  assertNear(res.rayDirection.y, -1, 1e-6);
  assertNear(res.rayDirection.z, 0, 1e-6);
});

test("calculateSunPosition computes accurate Horizon cardinal directions", () => {
  const d = 50;

  // Azimuth 0 deg (Front / +Z)
  const front = calculateSunPosition({ azimuth: 0, elevation: 0, distance: d });
  assertNear(front.x, 0, 1e-6);
  assertNear(front.y, 0, 1e-6);
  assertNear(front.z, d, 1e-6);
  assertNear(front.direction.z, 1, 1e-6);

  // Azimuth 90 deg (Right / +X)
  const right = calculateSunPosition({ azimuth: 90, elevation: 0, distance: d });
  assertNear(right.x, d, 1e-6);
  assertNear(right.y, 0, 1e-6);
  assertNear(right.z, 0, 1e-6);
  assertNear(right.direction.x, 1, 1e-6);

  // Azimuth 180 deg (Back / -Z)
  const back = calculateSunPosition({ azimuth: 180, elevation: 0, distance: d });
  assertNear(back.x, 0, 1e-6);
  assertNear(back.y, 0, 1e-6);
  assertNear(back.z, -d, 1e-6);
  assertNear(back.direction.z, -1, 1e-6);

  // Azimuth 270 deg (Left / -X)
  const left = calculateSunPosition({ azimuth: 270, elevation: 0, distance: d });
  assertNear(left.x, -d, 1e-6);
  assertNear(left.y, 0, 1e-6);
  assertNear(left.z, 0, 1e-6);
  assertNear(left.direction.x, -1, 1e-6);
});

test("calculateSunPosition computes accurate 3D positions across all four quadrants", () => {
  const d = 40;
  const el = 45;

  // Quadrant 1: Azimuth 45 deg (+X, +Z)
  const q1 = calculateSunPosition({ azimuth: 45, elevation: el, distance: d });
  assert.ok(q1.x > 0, "Q1 x must be positive");
  assert.ok(q1.y > 0, "Q1 y must be positive");
  assert.ok(q1.z > 0, "Q1 z must be positive");
  const mag1 = Math.sqrt(q1.x * q1.x + q1.y * q1.y + q1.z * q1.z);
  assertNear(mag1, d, 1e-5, "Q1 magnitude");

  // Quadrant 2: Azimuth 135 deg (+X, -Z)
  const q2 = calculateSunPosition({ azimuth: 135, elevation: el, distance: d });
  assert.ok(q2.x > 0, "Q2 x must be positive");
  assert.ok(q2.y > 0, "Q2 y must be positive");
  assert.ok(q2.z < 0, "Q2 z must be negative");
  const mag2 = Math.sqrt(q2.x * q2.x + q2.y * q2.y + q2.z * q2.z);
  assertNear(mag2, d, 1e-5, "Q2 magnitude");

  // Quadrant 3: Azimuth 225 deg (-X, -Z)
  const q3 = calculateSunPosition({ azimuth: 225, elevation: el, distance: d });
  assert.ok(q3.x < 0, "Q3 x must be negative");
  assert.ok(q3.y > 0, "Q3 y must be positive");
  assert.ok(q3.z < 0, "Q3 z must be negative");
  const mag3 = Math.sqrt(q3.x * q3.x + q3.y * q3.y + q3.z * q3.z);
  assertNear(mag3, d, 1e-5, "Q3 magnitude");

  // Quadrant 4: Azimuth 315 deg (-X, +Z)
  const q4 = calculateSunPosition({ azimuth: 315, elevation: el, distance: d });
  assert.ok(q4.x < 0, "Q4 x must be negative");
  assert.ok(q4.y > 0, "Q4 y must be positive");
  assert.ok(q4.z > 0, "Q4 z must be positive");
  const mag4 = Math.sqrt(q4.x * q4.x + q4.y * q4.y + q4.z * q4.z);
  assertNear(mag4, d, 1e-5, "Q4 magnitude");

  const dirMag = Math.sqrt(q1.direction.x * q1.direction.x + q1.direction.y * q1.direction.y + q1.direction.z * q1.direction.z);
  assertNear(dirMag, 1.0, 1e-6, "Direction vector should have length 1");
});

test("calculateSunPosition supports edge cases: nadir, distance 0, radians", () => {
  // Nadir (-90 deg elevation, straight down)
  const nadir = calculateSunPosition({ azimuth: 0, elevation: -90, distance: 75 });
  assertNear(nadir.x, 0, 1e-6);
  assertNear(nadir.y, -75, 1e-6);
  assertNear(nadir.z, 0, 1e-6);
  assertNear(nadir.direction.y, -1, 1e-6);

  // Distance 0
  const zero = calculateSunPosition({ azimuth: 45, elevation: 45, distance: 0 });
  assert.equal(zero.x, 0);
  assert.equal(zero.y, 0);
  assert.equal(zero.z, 0);

  // Radians input
  const radPos = calculateSunPosition({
    azimuth: Math.PI / 4,
    elevation: Math.PI / 6,
    distance: 100,
    radians: true
  });
  assertNear(radPos.y, 50, 1e-5); // sin(30 deg) * 100 = 50
  assertNear(radPos.azimuth, 45, 1e-5);
  assertNear(radPos.elevation, 30, 1e-5);

  // Positional calling signature: calculateSunPosition(azimuth, elevation, distance)
  const positional = calculateSunPosition(60, 30, 80);
  assertNear(positional.y, 40, 1e-5); // sin(30 deg) * 80 = 40
  assertNear(positional.distance, 80, 1e-5);
});

test("calculateSunAngles performs accurate inverse spherical calculation", () => {
  const testAngles = [
    { az: 0, el: 90, dist: 100 },
    { az: 45, el: 30, dist: 50 },
    { az: 120, el: 60, dist: 80 },
    { az: 210, el: 15, dist: 65 },
    { az: 330, el: 45, dist: 90 }
  ];

  for (const { az, el, dist } of testAngles) {
    const pos = calculateSunPosition({ azimuth: az, elevation: el, distance: dist });
    const recovered = calculateSunAngles(pos.x, pos.y, pos.z);

    assertNear(recovered.azimuth, az, 1e-4, `Azimuth recovery for ${az} deg`);
    assertNear(recovered.elevation, el, 1e-4, `Elevation recovery for ${el} deg`);
    assertNear(recovered.distance, dist, 1e-4, `Distance recovery for dist ${dist}`);
  }

  // Accepts array [x, y, z] and object {x, y, z}
  const arrRecovery = calculateSunAngles([0, 50, 0]);
  assertNear(arrRecovery.elevation, 90, 1e-4);
  assertNear(arrRecovery.distance, 50, 1e-4);

  const objRecovery = calculateSunAngles({ x: 50, y: 0, z: 0 });
  assertNear(objRecovery.azimuth, 90, 1e-4);
  assertNear(objRecovery.elevation, 0, 1e-4);
  assertNear(objRecovery.distance, 50, 1e-4);

  // Zero distance
  const zeroRecovery = calculateSunAngles(0, 0, 0);
  assert.equal(zeroRecovery.distance, 0);
});
// -----------------------------------------------------------------------------
// 3. setSunAngle Standalone Helper Tests
// -----------------------------------------------------------------------------

test("setSunAngle updates DirectionalLight position and target cleanly", () => {
  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.target = new THREE.Object3D();

  const pos = setSunAngle(light, 60, 30, 80);
  assertNear(light.position.x, pos.x, 1e-5);
  assertNear(light.position.y, pos.y, 1e-5);
  assertNear(light.position.z, pos.z, 1e-5);

  assert.equal(light.userData.azimuth, 60);
  assert.equal(light.userData.elevation, 30);
  assert.equal(light.userData.distance, 80);

  // Supports options object
  setSunAngle(light, { azimuth: 120, elevation: 45, distance: 60 });
  assertNear(light.position.y, 60 * Math.sin((45 * Math.PI) / 180), 1e-5);

  assert.throws(() => setSunAngle(null, 45, 30), TypeError);
});

// -----------------------------------------------------------------------------
// 4. LightingRig Class & Factory API Tests
// -----------------------------------------------------------------------------

test("createLightingRig instantiates rig with default Studio Neutral preset and attaches to scene", () => {
  const scene = new THREE.Scene();
  const rig = createLightingRig(scene);

  assert.ok(rig instanceof LightingRig);
  assert.strictEqual(rig.scene, scene);
  assert.ok(scene.children.includes(rig.group), "Rig group must be added to scene");

  // Default preset is Studio Neutral for accurate surface inspection
  assert.equal(rig.currentPresetId, "studio-neutral");
  assert.equal(rig.sunLight.color.getHexString(), "ffffff");
  assertNear(rig.sunLight.intensity, 1.0);
  assert.equal(rig.ambientLight.color.getHexString(), "ffffff");
  assertNear(rig.ambientLight.intensity, 0.4);

  // Directional sun properties
  assert.equal(rig.sunLight.castShadow, true);
  assert.equal(rig.sunLight.shadow.mapSize.width, 2048);
  assert.equal(rig.sunLight.shadow.mapSize.height, 2048);
  assert.strictEqual(rig.keyLight, rig.sunLight, "keyLight should alias sunLight");

  // Secondary lights should be active in 3-point Studio Neutral
  assert.equal(rig.fillLight.visible, true);
  assert.equal(rig.fillLight.color.getHexString(), "ffffff");
  assertNear(rig.fillLight.intensity, 0.3);
  assert.equal(rig.rimLight.visible, true);
  assert.equal(rig.rimLight.color.getHexString(), "ffffff");
  assertNear(rig.rimLight.intensity, 0.2);

  rig.dispose();
  assert.ok(!scene.children.includes(rig.group), "Rig group should be removed on dispose");
});

test("LightingRig allows real-time sun angle adjustments", () => {
  const rig = new LightingRig();

  const pos1 = rig.setSunAngle(90, 0, 50);
  assertNear(rig.sunLight.position.x, 50, 1e-5);
  assertNear(rig.sunLight.position.y, 0, 1e-5);
  assertNear(rig.sunLight.position.z, 0, 1e-5);
  assert.equal(rig.azimuth, 90);
  assert.equal(rig.elevation, 0);

  // Object call signature
  rig.setSunAngle({ azimuth: 0, elevation: 90, distance: 70 });
  const sunPos = rig.getSunPosition();
  assertNear(sunPos.x, 0, 1e-5);
  assertNear(sunPos.y, 70, 1e-5);
  assertNear(sunPos.z, 0, 1e-5);
});

test("LightingRig switches presets dynamically without light duplication or memory leaks", () => {
  const scene = new THREE.Scene();
  const rig = createLightingRig(scene, { preset: "trailer-golden-hour" });

  const initialSceneChildCount = scene.children.length;
  const initialGroupChildCount = rig.group.children.length;

  // 1. Switch to Studio Neutral (3-point diffuse setup)
  rig.setPreset("studio-neutral");
  assert.equal(rig.currentPresetId, "studio-neutral");

  // Key light: neutral white #ffffff, intensity 1.0, position [5, 10, 7]
  assert.equal(rig.sunLight.color.getHexString(), "ffffff");
  assertNear(rig.sunLight.intensity, 1.0);
  assert.deepEqual([rig.sunLight.position.x, rig.sunLight.position.y, rig.sunLight.position.z], [5, 10, 7]);

  // Ambient: #ffffff, intensity 0.4
  assert.equal(rig.ambientLight.color.getHexString(), "ffffff");
  assertNear(rig.ambientLight.intensity, 0.4);

  // Fill light: active, #ffffff, intensity 0.3, position [-5, 2, -5]
  assert.equal(rig.fillLight.visible, true);
  assert.equal(rig.fillLight.color.getHexString(), "ffffff");
  assertNear(rig.fillLight.intensity, 0.3);
  assert.deepEqual([rig.fillLight.position.x, rig.fillLight.position.y, rig.fillLight.position.z], [-5, 2, -5]);

  // Rim light: active, #ffffff, intensity 0.2, position [0, -8, 0]
  assert.equal(rig.rimLight.visible, true);
  assert.equal(rig.rimLight.color.getHexString(), "ffffff");
  assertNear(rig.rimLight.intensity, 0.2);
  assert.deepEqual([rig.rimLight.position.x, rig.rimLight.position.y, rig.rimLight.position.z], [0, -8, 0]);

  // 2. Switch to Noon Clear
  rig.setPreset("noon-clear");
  assert.equal(rig.currentPresetId, "noon-clear");

  // Sunlight: #ffffff, intensity 1.5, high elevation (85 deg)
  assert.equal(rig.sunLight.color.getHexString(), "ffffff");
  assertNear(rig.sunLight.intensity, 1.5);
  assertNear(rig.ambientLight.intensity, 0.8);
  assert.equal(rig.ambientLight.color.getHexString(), "ffffff");
  assertNear(rig.elevation, 85);

  // Fill and rim lights should be turned off
  assert.equal(rig.fillLight.visible, false);
  assert.equal(rig.fillLight.intensity, 0);
  assert.equal(rig.rimLight.visible, false);
  assert.equal(rig.rimLight.intensity, 0);

  // 3. Switch back to Trailer Golden Hour
  rig.setPreset("trailer-golden-hour");
  assert.equal(rig.currentPresetId, "trailer-golden-hour");
  assert.equal(rig.sunLight.color.getHexString(), "ffb366");
  assertNear(rig.sunLight.intensity, 1.2);
  assert.equal(rig.ambientLight.color.getHexString(), "8ca0ba");
  assertNear(rig.ambientLight.intensity, 0.4);
  assert.equal(rig.fillLight.visible, false);
  assert.equal(rig.rimLight.visible, false);

  // VERIFY NO LIGHT DUPLICATION:
  // Scene child count and rig group child count must remain strictly constant!
  assert.equal(scene.children.length, initialSceneChildCount, "Scene child count must remain constant");
  assert.equal(rig.group.children.length, initialGroupChildCount, "Group child count must remain constant");

  rig.dispose();
});

test("LightingRig controls shadows, colors, and intensities directly", () => {
  const rig = new LightingRig();

  // Shadow controls
  rig.setShadows(false);
  assert.equal(rig.sunLight.castShadow, false);

  rig.setShadows(true, 1024);
  assert.equal(rig.sunLight.castShadow, true);
  assert.equal(rig.sunLight.shadow.mapSize.width, 1024);

  // Sun color and intensity
  rig.setSunColor("#ffaa00", 2.2);
  assert.equal(rig.sunLight.color.getHexString(), "ffaa00");
  assert.equal(rig.sunLight.intensity, 2.2);

  // Ambient color and intensity
  rig.setAmbientColor(0x334455, 0.4);
  assert.equal(rig.ambientLight.color.getHexString(), "334455");
  assert.equal(rig.ambientLight.intensity, 0.4);
});

// -----------------------------------------------------------------------------
// 5. applyLightingPreset Standalone Utility Tests
// -----------------------------------------------------------------------------

test("applyLightingPreset configures scene, LightingRig, and light dictionaries", () => {
  const scene = new THREE.Scene();

  // Apply to scene: creates and caches __lightingRig
  const rig = applyLightingPreset(scene, "noon-clear");
  assert.ok(rig instanceof LightingRig);
  assert.strictEqual(scene.__lightingRig, rig);
  assert.equal(rig.currentPresetId, "noon-clear");

  // Subsequent call on the same scene reuses the existing rig without duplicating
  const childCountBefore = scene.children.length;
  applyLightingPreset(scene, "trailer-golden-hour");
  assert.equal(scene.children.length, childCountBefore);
  assert.equal(rig.currentPresetId, "trailer-golden-hour");

  // Apply directly to a LightingRig instance
  applyLightingPreset(rig, "studio-neutral");
  assert.equal(rig.currentPresetId, "studio-neutral");

  // Apply to custom light dictionary
  const customLights = {
    sunLight: new THREE.DirectionalLight(),
    ambientLight: new THREE.AmbientLight(),
    fillLight: new THREE.DirectionalLight(),
    rimLight: new THREE.DirectionalLight()
  };

  applyLightingPreset(customLights, "studio-neutral");
  assert.equal(customLights.sunLight.color.getHexString(), "ffffff");
  assert.equal(customLights.ambientLight.color.getHexString(), "ffffff");
  assert.equal(customLights.fillLight.visible, true);
  assert.equal(customLights.rimLight.visible, true);

  applyLightingPreset(customLights, "trailer-golden-hour");
  assert.equal(customLights.sunLight.color.getHexString(), "ffb366");
  assert.equal(customLights.fillLight.visible, false);

  assert.throws(() => applyLightingPreset(null, "noon-clear"), TypeError);
  assert.throws(() => applyLightingPreset(rig, "non-existent-preset"), Error);

  rig.dispose();
});

// -----------------------------------------------------------------------------
// 6. Tone Mapping & Calibrated Color Inspection Tests (Issue #49)
// -----------------------------------------------------------------------------

test("configureToneMapping sets ACESFilmicToneMapping and exposure 1.0 on renderer", () => {
  const mockRenderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 0.5
  };

  const configured = configureToneMapping(mockRenderer);
  assert.strictEqual(configured, mockRenderer);
  assert.equal(mockRenderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(mockRenderer.toneMappingExposure, 1.0);
  assert.equal(DEFAULT_TONE_MAPPING, THREE.ACESFilmicToneMapping);
  assert.equal(DEFAULT_TONE_MAPPING_EXPOSURE, 1.0);
});

test("configureToneMapping supports custom tone mapping and exposure options", () => {
  const mockRenderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1.0
  };

  // AgX tone mapping test if available, or custom tone mapping enum
  const targetToneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
  configureToneMapping(mockRenderer, {
    toneMapping: targetToneMapping,
    exposure: 1.25
  });

  assert.equal(mockRenderer.toneMapping, targetToneMapping);
  assert.equal(mockRenderer.toneMappingExposure, 1.25);
});

test("LightingRig accepts renderer option and automatically configures tone mapping", () => {
  const scene = new THREE.Scene();
  const mockRenderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 0.5
  };

  const rig = createLightingRig(scene, { renderer: mockRenderer });
  assert.equal(mockRenderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(mockRenderer.toneMappingExposure, 1.0);
  rig.dispose();
});

test("Calibrated light intensities prevent highlight blowout and preserve texture hue", () => {
  // 1. Studio Neutral calibration: Key 1.0 + Ambient 0.4 = 1.4 combined illumination
  const studioPreset = LIGHTING_PRESETS["studio-neutral"];
  const studioTotal = studioPreset.sun.intensity + studioPreset.ambient.intensity;
  assert.ok(studioTotal <= 1.5, `Studio Neutral combined illumination (${studioTotal}) should not exceed 1.5`);
  assert.equal(studioPreset.sun.hex, "#ffffff", "Studio Neutral key light must be pure white for inspection");
  assert.equal(studioPreset.ambient.hex, "#ffffff", "Studio Neutral ambient light must be pure white for inspection");
  assert.equal(studioPreset.fill.hex, "#ffffff", "Studio Neutral fill light must be pure white to prevent blue hue shift");
  assert.equal(studioPreset.rim.hex, "#ffffff", "Studio Neutral rim light must be pure white to prevent warm hue shift");

  // 2. Trailer Golden Hour calibration: Sun 1.2 + Ambient 0.4 = 1.6 combined illumination (softened from 2.4)
  const goldenPreset = LIGHTING_PRESETS["trailer-golden-hour"];
  const goldenTotal = goldenPreset.sun.intensity + goldenPreset.ambient.intensity;
  assert.ok(goldenTotal <= 1.7, `Trailer Golden Hour combined illumination (${goldenTotal}) should not exceed 1.7`);
  assert.ok(goldenPreset.sun.intensity <= 1.3, "Sunlight intensity must be softened to prevent specular highlight burnout");
  assert.ok(goldenPreset.ambient.intensity <= 0.5, "Ambient intensity must be softened to preserve shadow contrast");
});
